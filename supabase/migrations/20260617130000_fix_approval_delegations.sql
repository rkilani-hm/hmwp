-- =============================================================================
-- Fix Approval Delegation (end-to-end)            spec: specs/fix-approval-delegation.md
-- =============================================================================
--
-- The approval-delegation feature was frontend-complete but backend-missing:
-- the `approval_delegations` table never existed in the live DB, the delegate
-- dropdown was empty for non-admins (profiles RLS is own-row-only), and there
-- was no server-side machinery to actually ROUTE a pending step to a delegate.
--
-- Authorization model (product owner): an ACTIVE delegation alone authorizes the
-- delegate to approve on the delegator's behalf — no admin role-grant. While a
-- delegation is active, notifications + inbox route to the DELEGATE ONLY (the
-- person now in charge), not the delegator; when the window ends or it is
-- revoked, routing reverts to the delegator automatically (purely time-driven).
--
-- This migration supersedes the never-applied draft
-- (20260513220000_approval_delegations.sql), which used a DELETE policy, a bespoke
-- touch trigger, additive `effective_approvers` semantics, and no R2/R4/R5/R7
-- machinery. Everything here is idempotent so it produces the correct end state
-- whether or not that draft was ever applied.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Clean up the never-applied draft's objects if they are present.
-- ---------------------------------------------------------------------------
-- Not table-scoped — safe whether or not the table exists.
DROP FUNCTION IF EXISTS public.tr_approval_delegations_touch();
-- The old additive view is replaced by SECURITY DEFINER resolution functions.
DROP VIEW IF EXISTS public.effective_approvers;

-- Table-scoped draft objects: DROP ... ON <table> raises 42P01 if the table is
-- absent, so only attempt these when the draft actually created the table.
DO $$
BEGIN
  IF to_regclass('public.approval_delegations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users see own delegations"         ON public.approval_delegations;
    DROP POLICY IF EXISTS "Delegator creates own delegations" ON public.approval_delegations;
    DROP POLICY IF EXISTS "Delegator updates own delegations" ON public.approval_delegations;
    DROP POLICY IF EXISTS "Delegator deletes own delegations" ON public.approval_delegations;
    DROP TRIGGER IF EXISTS approval_delegations_touch ON public.approval_delegations;
    DROP INDEX IF EXISTS public.idx_approval_delegations_delegator;
    DROP INDEX IF EXISTS public.idx_approval_delegations_delegate;
    DROP INDEX IF EXISTS public.idx_approval_delegations_validity;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 1. Table  (R1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_delegations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegate_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id      uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  valid_from   timestamptz NOT NULL,
  valid_to     timestamptz NOT NULL,
  reason       text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_delegations_window_chk    CHECK (valid_to > valid_from),
  CONSTRAINT approval_delegations_distinct_chk  CHECK (delegator_id <> delegate_id)
);

-- Reconcile drift if the draft created the table with a different shape.
ALTER TABLE public.approval_delegations ALTER COLUMN valid_from DROP DEFAULT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_delegations_window_chk') THEN
    ALTER TABLE public.approval_delegations
      ADD CONSTRAINT approval_delegations_window_chk CHECK (valid_to > valid_from);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_delegations_distinct_chk') THEN
    ALTER TABLE public.approval_delegations
      ADD CONSTRAINT approval_delegations_distinct_chk CHECK (delegator_id <> delegate_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate
  ON public.approval_delegations (delegate_id, is_active, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator
  ON public.approval_delegations (delegator_id);

COMMENT ON TABLE public.approval_delegations IS
  'Temporary delegation of approval authority. While active, routing (inbox + '
  'notifications) moves from delegator to delegate; reverts automatically when '
  'the window ends or is_active is set false.';

-- updated_at via the project-standard trigger function (R1).
DROP TRIGGER IF EXISTS approval_delegations_set_updated_at ON public.approval_delegations;
CREATE TRIGGER approval_delegations_set_updated_at
  BEFORE UPDATE ON public.approval_delegations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Staff helper used by RLS + the delegatable-employees RPC
-- ---------------------------------------------------------------------------
-- "Non-tenant staff" = holds at least one role whose name is not 'tenant'.
CREATE OR REPLACE FUNCTION public.is_non_tenant_staff(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user
      AND r.name <> 'tenant'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS  (R3)
-- ---------------------------------------------------------------------------
ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

-- Drop our own policy names first so this migration is safely re-runnable.
DROP POLICY IF EXISTS "Involving-me select"   ON public.approval_delegations;
DROP POLICY IF EXISTS "Self insert non-tenant" ON public.approval_delegations;
DROP POLICY IF EXISTS "Delegator update"       ON public.approval_delegations;

-- SELECT: rows that involve me (either side); admins may read all.
CREATE POLICY "Involving-me select"
  ON public.approval_delegations FOR SELECT
  USING (
    delegator_id = auth.uid()
    OR delegate_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- INSERT: I may only delegate my OWN authority, I must be non-tenant staff,
-- and the delegate must be non-tenant staff too (E5). Self-delegation is
-- additionally blocked by the table CHECK (E6).
CREATE POLICY "Self insert non-tenant"
  ON public.approval_delegations FOR INSERT
  WITH CHECK (
    delegator_id = auth.uid()
    AND public.is_non_tenant_staff(auth.uid())
    AND public.is_non_tenant_staff(delegate_id)
  );

-- UPDATE (revoke): only the delegator can revoke; the app only flips is_active.
CREATE POLICY "Delegator update"
  ON public.approval_delegations FOR UPDATE
  USING (delegator_id = auth.uid())
  WITH CHECK (delegator_id = auth.uid());

-- No DELETE policy by design (R3).

GRANT SELECT, INSERT, UPDATE ON public.approval_delegations TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. list_delegatable_employees()  (R2)
-- ---------------------------------------------------------------------------
-- Returns non-tenant staff (excluding the caller) WITHOUT loosening profiles
-- RLS. SECURITY DEFINER so non-admins get a populated dropdown.
CREATE OR REPLACE FUNCTION public.list_delegatable_employees()
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND public.is_non_tenant_staff(p.id)
  ORDER BY p.full_name NULLS LAST, p.email;
$$;

-- Revoke the implicit PUBLIC grant; expose to authenticated only (not anon).
REVOKE ALL ON FUNCTION public.list_delegatable_employees() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_delegatable_employees() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_delegatable_employees() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. active_delegation_for(delegator, role_id)  (R4)  — single source of truth
-- ---------------------------------------------------------------------------
-- Returns the delegate currently acting for a delegator+role, or NULL. "Active"
-- = is_active AND now() in [valid_from, valid_to). role_id IS NULL on a
-- delegation matches ANY role (blanket). On overlap, the most recently created
-- active delegation wins (E2). Future/expired/revoked never match (E3).
CREATE OR REPLACE FUNCTION public.active_delegation_for(p_delegator uuid, p_role_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ad.delegate_id
  FROM public.approval_delegations ad
  WHERE ad.delegator_id = p_delegator
    AND ad.is_active = true
    AND now() >= ad.valid_from
    AND now() <  ad.valid_to
    AND (ad.role_id IS NULL OR ad.role_id = p_role_id)
  ORDER BY ad.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.active_delegation_for(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Effective-role resolution for the current user  (R5 inbox + role pick)
-- ---------------------------------------------------------------------------
-- Reroute semantics: a role the caller has delegated away DROPS from their
-- effective set, and each role delegated TO the caller is ADDED. SECURITY
-- DEFINER so it can read user_roles for the *delegator* (own-row-only RLS would
-- otherwise hide it). Only ever returns the caller's own effective roles.
CREATE OR REPLACE FUNCTION public.get_my_effective_roles()
RETURNS TABLE (role_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Direct assignments, minus any role actively delegated away.
  SELECT r.name
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()
    AND public.active_delegation_for(ur.user_id, ur.role_id) IS NULL

  UNION

  -- Roles delegated TO me by an active delegation where I am the winning delegate.
  SELECT r.name
  FROM public.approval_delegations ad
  JOIN public.user_roles ur
    ON ur.user_id = ad.delegator_id
   AND (ad.role_id IS NULL OR ad.role_id = ur.role_id)
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ad.is_active = true
    AND now() >= ad.valid_from
    AND now() <  ad.valid_to
    AND public.active_delegation_for(ad.delegator_id, ur.role_id) = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_effective_roles() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_delegation_origin(acting_user, role_name)  (R7 audit attribution)
-- ---------------------------------------------------------------------------
-- If the acting user is approving via an active delegation for this role,
-- returns the delegator (original holder) id; else NULL. Self-contained
-- (does not depend on the dropped view). Consumed by the client approve path.
CREATE OR REPLACE FUNCTION public.get_delegation_origin(acting_user_id uuid, acting_role_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ad.delegator_id
  FROM public.approval_delegations ad
  JOIN public.user_roles ur
    ON ur.user_id = ad.delegator_id
   AND (ad.role_id IS NULL OR ad.role_id = ur.role_id)
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ad.delegate_id = acting_user_id
    AND r.name = acting_role_name
    AND ad.is_active = true
    AND now() >= ad.valid_from
    AND now() <  ad.valid_to
    -- Only when the acting user is NOT a genuine direct holder of this role.
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur2
      JOIN public.roles r2 ON r2.id = ur2.role_id
      WHERE ur2.user_id = acting_user_id AND r2.name = acting_role_name
    )
  ORDER BY ad.created_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_delegation_origin(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. authorize_permit_approval(user, role_name)  (R6 server-side gate)
-- ---------------------------------------------------------------------------
-- The single server-side decision used by the edge function. Allowed when the
-- acting user genuinely holds the step's role, OR is admin, OR is a non-tenant
-- delegate with an active delegation for that role from a genuine role holder.
-- on_behalf_of is set ONLY when acting purely as a delegate (not a direct holder).
CREATE OR REPLACE FUNCTION public.authorize_permit_approval(p_user uuid, p_role_name text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_direct      boolean;
  v_admin       boolean;
  v_delegator   uuid;
  v_name        text;
  v_allowed     boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user AND r.name = p_role_name
  ) INTO v_direct;

  SELECT public.has_role(p_user, 'admin'::app_role) INTO v_admin;

  -- Active, non-tenant delegate acting for a genuine holder of this role.
  IF NOT v_direct AND public.is_non_tenant_staff(p_user) THEN
    SELECT ad.delegator_id
      INTO v_delegator
      FROM public.approval_delegations ad
      JOIN public.user_roles ur ON ur.user_id = ad.delegator_id
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ad.delegate_id = p_user
       AND r.name = p_role_name
       AND (ad.role_id IS NULL OR ad.role_id = r.id)
       AND ad.is_active = true
       AND now() >= ad.valid_from
       AND now() <  ad.valid_to
     ORDER BY ad.created_at DESC
     LIMIT 1;
  END IF;

  v_allowed := v_direct OR v_admin OR (v_delegator IS NOT NULL);

  IF v_delegator IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_delegator;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'is_direct', v_direct,
    'is_admin', v_admin,
    'on_behalf_of', v_delegator,
    'on_behalf_of_name', v_name
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.authorize_permit_approval(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Reroute notifications to the active delegate  (R5)
-- ---------------------------------------------------------------------------
-- Same body as the live function, except each would-be recipient (a holder of
-- the active role) is replaced by their active delegate for that role when one
-- exists. Recipients are deduped, so a delegator+delegate who both hold the
-- role are not double-notified (E4).
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
  v_holder_id     uuid;
  v_user_id       uuid;
  v_email         text;
  v_title_prefix  text;
BEGIN
  IF p_notification_type NOT IN ('new_permit', 'resubmitted') THEN
    RAISE EXCEPTION 'invalid notification_type: %', p_notification_type;
  END IF;

  SELECT id, requester_id, permit_no, urgency, requester_name
    INTO v_permit
    FROM public.work_permits
   WHERE id = p_permit_id;

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
            WHERE paa.permit_id = p_permit_id AND ur.user_id = v_caller_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.permit_approvals pa
            WHERE pa.permit_id = p_permit_id
              AND pa.approver_user_id = v_caller_id
              AND pa.status IN ('approved', 'rejected')
         ))
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

    FOR v_holder_id IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role_id = v_role_row.role_id
    LOOP
      -- R5 reroute: if this holder has an active delegation for this role,
      -- the recipient becomes the delegate only.
      v_user_id := COALESCE(public.active_delegation_for(v_holder_id, v_role_row.role_id), v_holder_id);

      INSERT INTO public.notifications (user_id, permit_id, type, title, message)
      SELECT v_user_id, p_permit_id, p_notification_type,
        CASE p_notification_type
          WHEN 'resubmitted' THEN 'Work Permit Resubmitted for Review'
          ELSE v_title_prefix || 'Permit Awaiting Your Review'
        END,
        v_permit.permit_no ||
          CASE p_notification_type
            WHEN 'resubmitted' THEN ' has been resubmitted for your approval. '
            ELSE ' is pending your approval. '
          END ||
          CASE WHEN v_permit.urgency = 'urgent' THEN '4-hour SLA.' ELSE '48-hour SLA.' END
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_user_id AND n.permit_id = p_permit_id AND n.type = p_notification_type
      );

      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      v_user_ids := array_append(v_user_ids, v_user_id);

      v_email := public.resolve_user_email(v_user_id);
      IF v_email IS NOT NULL AND v_email <> '' THEN
        v_emails := array_append(v_emails, v_email);
      ELSE
        v_skipped_no_email := v_skipped_no_email + 1;
        RAISE NOTICE 'notify_permit_active_approvers: no email found for user_id=% (role=%) on permit %.',
          v_user_id, v_role_row.role_name, v_permit.permit_no;
      END IF;
    END LOOP;
  END LOOP;

  IF v_skipped_no_email > 0 THEN
    RAISE WARNING 'notify_permit_active_approvers: permit % — % user(s) skipped due to missing email.',
      v_permit.permit_no, v_skipped_no_email;
  END IF;

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
-- 10. Audit: log delegation create + revoke to user_activity_logs  (R7)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_log_delegation_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email     text;
  v_delegate  text;
  v_role      text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.delegator_id;
  SELECT COALESCE(full_name, email) INTO v_delegate FROM public.profiles WHERE id = NEW.delegate_id;
  SELECT CASE WHEN NEW.role_id IS NULL THEN 'all roles' ELSE label END
    INTO v_role FROM public.roles WHERE id = NEW.role_id;
  v_role := COALESCE(v_role, 'all roles');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details)
    VALUES (NEW.delegator_id, COALESCE(v_email, 'unknown'), 'delegation_created',
      format('Delegated %s to %s (%s → %s)%s',
        v_role, COALESCE(v_delegate, NEW.delegate_id::text),
        to_char(NEW.valid_from, 'YYYY-MM-DD HH24:MI'),
        to_char(NEW.valid_to,   'YYYY-MM-DD HH24:MI'),
        CASE WHEN NEW.reason IS NOT NULL THEN ' — ' || NEW.reason ELSE '' END));
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details)
    VALUES (NEW.delegator_id, COALESCE(v_email, 'unknown'), 'delegation_revoked',
      format('Revoked delegation of %s to %s', v_role, COALESCE(v_delegate, NEW.delegate_id::text)));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_delegations_audit_ins ON public.approval_delegations;
CREATE TRIGGER approval_delegations_audit_ins
  AFTER INSERT ON public.approval_delegations
  FOR EACH ROW EXECUTE FUNCTION public.tr_log_delegation_change();

DROP TRIGGER IF EXISTS approval_delegations_audit_upd ON public.approval_delegations;
CREATE TRIGGER approval_delegations_audit_upd
  AFTER UPDATE ON public.approval_delegations
  FOR EACH ROW EXECUTE FUNCTION public.tr_log_delegation_change();

COMMIT;

NOTIFY pgrst, 'reload schema';
