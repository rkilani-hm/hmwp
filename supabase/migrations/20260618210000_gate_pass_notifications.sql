-- =============================================================================
-- Gate Pass approver notifications (parity with Work Permit)
--   spec: specs/gate-pass-approver-notifications.md
-- =============================================================================
--
-- GP notified no one. This adds the WP-style server-side fan-out:
--   * notifications.gate_pass_id (parity with permit_id) so a GP notification can
--     deep-link to the pass; nullable, like permit_id.
--   * notify_gate_pass_active_approvers() — SECURITY DEFINER, reads
--     gate_pass_active_approvers, reroutes each holder to their active delegate,
--     inserts idempotent in-app notifications, returns user_ids + emails for the
--     email/push edge functions. Mirrors notify_permit_active_approvers.
-- =============================================================================

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS gate_pass_id uuid REFERENCES public.gate_passes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_gate_pass ON public.notifications (gate_pass_id);

-- The type CHECK omitted the gatepass_* values that filter_tenant_notifications
-- already references, so even the existing 'gatepass_submitted' requester
-- notification was silently failing. Extend it (additive — existing types kept)
-- to include the GP types. 'gatepass_pending' is the approver fan-out type.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_permit','approval_needed','status_change','sla_warning','sla_breach',
  'permit_approved','permit_rejected',
  'gatepass_submitted','gatepass_approved','gatepass_rejected','gatepass_pending'
]::text[]));

CREATE OR REPLACE FUNCTION public.notify_gate_pass_active_approvers(p_gate_pass_id uuid, p_notification_type text DEFAULT 'gatepass_pending'::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_gp            record;
  v_caller_id     uuid := auth.uid();
  v_caller_admin  boolean;
  v_inserted      integer := 0;
  v_user_ids      uuid[]  := ARRAY[]::uuid[];
  v_emails        text[]  := ARRAY[]::text[];
  v_roles         text[]  := ARRAY[]::text[];
  v_skipped_no_email integer := 0;
  v_role_row      record;
  v_user_id       uuid;
  v_email         text;
  v_recipients    uuid[];
BEGIN
  SELECT id, requester_id, pass_no INTO v_gp FROM public.gate_passes WHERE id = p_gate_pass_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate pass not found: %', p_gate_pass_id; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  -- Caller must be the requester, an admin, or a current active approver.
  IF v_caller_id IS NULL
     OR (v_gp.requester_id <> v_caller_id
         AND NOT v_caller_admin
         AND NOT EXISTS (
           SELECT 1 FROM public.gate_pass_active_approvers gpa
             JOIN public.user_roles ur ON ur.role_id = gpa.role_id
            WHERE gpa.gate_pass_id = p_gate_pass_id AND ur.user_id = v_caller_id))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  FOR v_role_row IN
    SELECT DISTINCT gpa.role_id, gpa.role_name
      FROM public.gate_pass_active_approvers gpa
     WHERE gpa.gate_pass_id = p_gate_pass_id
  LOOP
    v_roles := array_append(v_roles, v_role_row.role_name);

    -- Holders of the active role, each rerouted to their active delegate.
    SELECT array_agg(DISTINCT COALESCE(public.active_delegation_for(ur.user_id, v_role_row.role_id), ur.user_id))
      INTO v_recipients
      FROM public.user_roles ur
     WHERE ur.role_id = v_role_row.role_id;

    IF v_recipients IS NULL THEN CONTINUE; END IF;

    FOREACH v_user_id IN ARRAY v_recipients
    LOOP
      INSERT INTO public.notifications (user_id, gate_pass_id, type, title, message)
      SELECT v_user_id, p_gate_pass_id, p_notification_type,
             'Gate Pass Awaiting Your Review',
             v_gp.pass_no || ' is pending your approval.'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_user_id AND n.gate_pass_id = p_gate_pass_id AND n.type = p_notification_type);
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
    'pass_no', v_gp.pass_no,
    'notification_type', p_notification_type,
    'skipped_no_email', v_skipped_no_email
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_gate_pass_active_approvers(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
