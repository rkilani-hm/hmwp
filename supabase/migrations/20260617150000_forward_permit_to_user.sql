-- =============================================================================
-- Forward a permit step to a specific USER (not a role)   spec: specs/forward-to-user.md
-- =============================================================================
--
-- Adds "forward to a specific internal user" alongside the existing
-- forward-to-role. A forward is a SINGLE-PERMIT, SINGLE-STEP grant: while active,
-- the permit's current step routes to the forwarded user ONLY (inbox +
-- notifications), and that user is authorized to approve/reject that step —
-- without holding the step's role and without an admin role-grant. It reuses the
-- delegation resolution path (no second router): one table feeding the inbox RPC,
-- the notify reroute, and the approval gate.
--
-- Unlike forward_permit_to_role, this does NOT change work_permits.status or the
-- permit_approvals role — the step stays role R; only the recipient changes.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table  (R1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permit_step_forwards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id    uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  role_name    text NOT NULL,
  forwarded_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  forwarded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permit_step_forwards_distinct_chk CHECK (forwarded_to <> forwarded_by)
);

CREATE INDEX IF NOT EXISTS idx_psf_resolve  ON public.permit_step_forwards (permit_id, role_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_psf_to       ON public.permit_step_forwards (forwarded_to, is_active);

COMMENT ON TABLE public.permit_step_forwards IS
  'Per-permit, per-step forward of approval authority to a specific user. While '
  'is_active, the step routes to forwarded_to only; cleared by re-forward or once '
  'the step is acted upon / advances.';

DROP TRIGGER IF EXISTS permit_step_forwards_set_updated_at ON public.permit_step_forwards;
CREATE TRIGGER permit_step_forwards_set_updated_at
  BEFORE UPDATE ON public.permit_step_forwards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. RLS  — read for the people involved + approvers/admins; writes via the
--    SECURITY DEFINER RPC only (no INSERT/UPDATE/DELETE grant to authenticated).
-- ---------------------------------------------------------------------------
ALTER TABLE public.permit_step_forwards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Forwards involving me or approvers" ON public.permit_step_forwards;
CREATE POLICY "Forwards involving me or approvers"
  ON public.permit_step_forwards FOR SELECT TO authenticated
  USING (
    forwarded_to = auth.uid()
    OR forwarded_by = auth.uid()
    OR public.is_approver(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

GRANT SELECT ON public.permit_step_forwards TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. active_forward_for(permit, role) — winning (most recent active) target
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.active_forward_for(p_permit_id uuid, p_role_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.forwarded_to
  FROM public.permit_step_forwards f
  WHERE f.permit_id = p_permit_id
    AND f.role_id = p_role_id
    AND f.is_active = true
  ORDER BY f.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.active_forward_for(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. forward origin for audit (R5) — who forwarded to the acting user, if any
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_forward_origin(acting_user_id uuid, p_permit_id uuid, acting_role_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.forwarded_by
  FROM public.permit_step_forwards f
  JOIN public.roles r ON r.id = f.role_id
  WHERE f.permit_id = p_permit_id
    AND r.name = acting_role_name
    AND f.is_active = true
    AND public.active_forward_for(f.permit_id, f.role_id) = acting_user_id
  ORDER BY f.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_forward_origin(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. authorize_permit_approval — add a PERMIT-AWARE overload (R3).  Allowed when
--    the user genuinely holds the role, OR is admin, OR is an active delegate, OR
--    is the active forward target for THIS permit+step. on_behalf_of/kind drive
--    audit.
--
--    NOTE: the existing 2-arg authorize_permit_approval(uuid, text) is KEPT, not
--    dropped. The currently-published edge function calls the 2-arg form; if we
--    dropped it, applying this migration before redeploying the edge function
--    would break every approval's auth check. The two overloads coexist, so
--    migration/edge/frontend can deploy in any order. The new edge function uses
--    this 3-arg form to also honor forwards.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authorize_permit_approval(p_user uuid, p_permit_id uuid, p_role_name text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role_id     uuid;
  v_direct      boolean;
  v_admin       boolean;
  v_delegator   uuid;
  v_forwarder   uuid;
  v_on_behalf   uuid;
  v_kind        text;
  v_name        text;
  v_allowed     boolean;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user AND r.name = p_role_name
  ) INTO v_direct;

  SELECT public.has_role(p_user, 'admin'::app_role) INTO v_admin;

  -- Active forward target for this permit+step (permit-scoped).
  IF NOT v_direct AND p_permit_id IS NOT NULL AND v_role_id IS NOT NULL
     AND public.is_non_tenant_staff(p_user)
     AND public.active_forward_for(p_permit_id, v_role_id) = p_user THEN
    SELECT f.forwarded_by INTO v_forwarder
      FROM public.permit_step_forwards f
     WHERE f.permit_id = p_permit_id AND f.role_id = v_role_id AND f.is_active = true
     ORDER BY f.created_at DESC LIMIT 1;
  END IF;

  -- Active role delegate (delegation path).
  IF NOT v_direct AND v_forwarder IS NULL AND public.is_non_tenant_staff(p_user) THEN
    SELECT ad.delegator_id INTO v_delegator
      FROM public.approval_delegations ad
      JOIN public.user_roles ur ON ur.user_id = ad.delegator_id
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ad.delegate_id = p_user
       AND r.name = p_role_name
       AND (ad.role_id IS NULL OR ad.role_id = r.id)
       AND ad.is_active = true
       AND now() >= ad.valid_from
       AND now() <  ad.valid_to
     ORDER BY ad.created_at DESC LIMIT 1;
  END IF;

  v_allowed := v_direct OR v_admin OR (v_forwarder IS NOT NULL) OR (v_delegator IS NOT NULL);

  IF v_forwarder IS NOT NULL THEN
    v_on_behalf := v_forwarder; v_kind := 'forward';
  ELSIF v_delegator IS NOT NULL THEN
    v_on_behalf := v_delegator; v_kind := 'delegation';
  END IF;

  IF v_on_behalf IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_on_behalf;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'is_direct', v_direct,
    'is_admin', v_admin,
    'on_behalf_of', v_on_behalf,
    'on_behalf_of_name', v_name,
    'on_behalf_of_kind', v_kind
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.authorize_permit_approval(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. get_my_inbox_permits — single resolution path for the inbox (R1a).
--    Role-based (delegation-aware) MINUS forwarded-away PLUS forwarded-to-me.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_inbox_permits()
RETURNS TABLE (permit_id uuid, sla_deadline timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Permits at a current step whose role is in my effective roles, EXCLUDING
  -- those forwarded to someone else (forwarded-away).
  SELECT paa.permit_id, paa.sla_deadline
  FROM public.permit_active_approvers paa
  WHERE paa.role_name IN (SELECT role_name FROM public.get_my_effective_roles())
    AND COALESCE(public.active_forward_for(paa.permit_id, paa.role_id), auth.uid()) = auth.uid()

  UNION

  -- Permits whose current step is forwarded TO me (even if I don't hold the role).
  SELECT paa.permit_id, paa.sla_deadline
  FROM public.permit_active_approvers paa
  WHERE public.active_forward_for(paa.permit_id, paa.role_id) = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_inbox_permits() TO authenticated;

-- The active role the caller should act AS on a permit (the current-step role
-- they are authorized for: direct / admin / forward / delegation). SECURITY
-- DEFINER so a forwarded user who is not otherwise an approver can still resolve
-- the role to submit to the edge function. Used by the inbox approve flow.
CREATE OR REPLACE FUNCTION public.get_my_action_role(p_permit_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT paa.role_name
  FROM public.permit_active_approvers paa
  WHERE paa.permit_id = p_permit_id
    AND (public.authorize_permit_approval(auth.uid(), p_permit_id, paa.role_name) ->> 'allowed')::boolean = true
  ORDER BY paa.role_name
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_action_role(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. notify_permit_active_approvers — forward-aware (R1c / E1).
--    For each active role on the permit: if the step is forwarded, the single
--    recipient is the forwarded user; otherwise the existing holder→delegate
--    reroute applies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_permit_active_approvers(p_permit_id uuid, p_notification_type text DEFAULT 'new_permit'::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_permit        record;
  v_caller_id     uuid := auth.uid();
  v_caller_admin  boolean;
  v_inserted      integer := 0;
  v_user_ids      uuid[]  := ARRAY[]::uuid[];
  v_emails        text[]  := ARRAY[]::text[];
  v_roles         text[]  := ARRAY[]::text[];
  v_skipped_no_email integer := 0;
  v_role_row      record;
  v_forward_to    uuid;
  v_holder_id     uuid;
  v_user_id       uuid;
  v_email         text;
  v_title_prefix  text;
  v_recipients    uuid[];
BEGIN
  IF p_notification_type NOT IN ('new_permit', 'resubmitted') THEN
    RAISE EXCEPTION 'invalid notification_type: %', p_notification_type;
  END IF;

  SELECT id, requester_id, permit_no, urgency, requester_name
    INTO v_permit FROM public.work_permits WHERE id = p_permit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit not found: %', p_permit_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF v_caller_id IS NULL
     OR (v_permit.requester_id <> v_caller_id
         AND NOT v_caller_admin
         AND NOT EXISTS (
           SELECT 1 FROM public.permit_active_approvers paa
             JOIN public.user_roles ur ON ur.role_id = paa.role_id
            WHERE paa.permit_id = p_permit_id AND ur.user_id = v_caller_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.permit_step_forwards f
            WHERE f.permit_id = p_permit_id AND f.is_active = true AND f.forwarded_to = v_caller_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.permit_approvals pa
            WHERE pa.permit_id = p_permit_id AND pa.approver_user_id = v_caller_id
              AND pa.status IN ('approved', 'rejected')))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_title_prefix := CASE WHEN v_permit.urgency = 'urgent' THEN 'New URGENT ' ELSE 'New ' END;

  FOR v_role_row IN
    SELECT DISTINCT paa.role_id, paa.role_name
      FROM public.permit_active_approvers paa
     WHERE paa.permit_id = p_permit_id
  LOOP
    v_roles := array_append(v_roles, v_role_row.role_name);

    -- Forward wins: the step's single recipient is the forwarded user.
    v_forward_to := public.active_forward_for(p_permit_id, v_role_row.role_id);
    IF v_forward_to IS NOT NULL THEN
      v_recipients := ARRAY[v_forward_to];
    ELSE
      -- Holders, each rerouted to their active delegate if any.
      SELECT array_agg(DISTINCT COALESCE(public.active_delegation_for(ur.user_id, v_role_row.role_id), ur.user_id))
        INTO v_recipients
        FROM public.user_roles ur
       WHERE ur.role_id = v_role_row.role_id;
    END IF;

    IF v_recipients IS NULL THEN CONTINUE; END IF;

    FOREACH v_user_id IN ARRAY v_recipients
    LOOP
      INSERT INTO public.notifications (user_id, permit_id, type, title, message)
      SELECT v_user_id, p_permit_id, p_notification_type,
        CASE p_notification_type WHEN 'resubmitted' THEN 'Work Permit Resubmitted for Review'
          ELSE v_title_prefix || 'Permit Awaiting Your Review' END,
        v_permit.permit_no ||
          CASE p_notification_type WHEN 'resubmitted' THEN ' has been resubmitted for your approval. '
            ELSE ' is pending your approval. ' END ||
          CASE WHEN v_permit.urgency = 'urgent' THEN '4-hour SLA.' ELSE '48-hour SLA.' END
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_user_id AND n.permit_id = p_permit_id AND n.type = p_notification_type);
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      v_user_ids := array_append(v_user_ids, v_user_id);

      v_email := public.resolve_user_email(v_user_id);
      IF v_email IS NOT NULL AND v_email <> '' THEN
        v_emails := array_append(v_emails, v_email);
      ELSE
        v_skipped_no_email := v_skipped_no_email + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_count', v_inserted,
    'user_ids', (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_user_ids) AS x),
    'emails', (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_emails) AS x),
    'active_roles', to_jsonb(v_roles),
    'permit_no', v_permit.permit_no,
    'urgency', v_permit.urgency,
    'requester_name', v_permit.requester_name,
    'notification_type', p_notification_type,
    'skipped_no_email', v_skipped_no_email
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. forward_permit_to_user(permit, user, reason)  (R1 / R5 / E3 / E6)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.forward_permit_to_user(p_permit_id uuid, p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_permit      record;
  v_caller      uuid := auth.uid();
  v_role        record;
  v_caller_name text;
  v_target_name text;
BEGIN
  SELECT id, permit_no, status, is_archived INTO v_permit
    FROM public.work_permits WHERE id = p_permit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'permit not found: %', p_permit_id; END IF;
  IF COALESCE(v_permit.is_archived, false) THEN RAISE EXCEPTION 'permit is archived'; END IF;
  IF v_permit.status::text IN ('approved','rejected','cancelled','closed') THEN
    RAISE EXCEPTION 'cannot forward terminal-state permit (status=%)', v_permit.status;
  END IF;

  -- Target must be non-tenant staff and not the caller (E6).
  IF p_user_id = v_caller THEN RAISE EXCEPTION 'cannot forward to yourself'; END IF;
  IF NOT public.is_non_tenant_staff(p_user_id) THEN
    RAISE EXCEPTION 'forward target must be internal staff (not a tenant)';
  END IF;

  -- Resolve the current step role the CALLER is authorized to act on, then
  -- forward THAT step. Authorization reuses the approval gate.
  SELECT paa.role_id, paa.role_name INTO v_role
    FROM public.permit_active_approvers paa
   WHERE paa.permit_id = p_permit_id
     AND (public.authorize_permit_approval(v_caller, p_permit_id, paa.role_name) ->> 'allowed')::boolean = true
   ORDER BY paa.role_name
   LIMIT 1;

  IF v_role.role_id IS NULL THEN
    RAISE EXCEPTION 'permission denied — must be admin or an active approver of the current step to forward';
  END IF;

  -- Re-forward: last one wins (E3) — clear prior active forwards for this step.
  UPDATE public.permit_step_forwards
     SET is_active = false, updated_at = now()
   WHERE permit_id = p_permit_id AND role_id = v_role.role_id AND is_active = true;

  INSERT INTO public.permit_step_forwards (permit_id, role_id, role_name, forwarded_to, forwarded_by)
  VALUES (p_permit_id, v_role.role_id, v_role.role_name, p_user_id, v_caller);

  SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = v_caller;
  SELECT COALESCE(full_name, email) INTO v_target_name FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.activity_logs (permit_id, action, performed_by, performed_by_id, details)
  VALUES (p_permit_id, 'Forwarded', COALESCE(v_caller_name, 'Unknown'), v_caller,
    'Forwarded to ' || COALESCE(v_target_name, p_user_id::text) || ' (' || v_role.role_name || ')'
      || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN ' — ' || p_reason ELSE '' END);

  RETURN jsonb_build_object(
    'permit_id', p_permit_id,
    'permit_no', v_permit.permit_no,
    'forwarded_to', p_user_id,
    'forwarded_to_name', v_target_name,
    'role_name', v_role.role_name
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.forward_permit_to_user(uuid, uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
