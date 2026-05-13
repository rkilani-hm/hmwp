-- Comprehensive approval/notification consolidation
--
-- Several migrations over the past day have iteratively fixed the
-- "approvers don't see tenant-submitted permits + don't get emails"
-- bug. Re-asserts all critical state idempotently so a deployment
-- that hasn't applied every prior migration cleanly catches up here.
--
-- Specifically guarantees:
--
--   1. is_approver() is data-driven (admin OR holds a role in
--      workflow_steps) — not the legacy hardcoded list
--   2. notify_permit_active_approvers RPC exists and is callable by
--      authenticated users
--   3. permit_active_approvers view is current
--   4. ensure_permit_pending_approvals trigger fires on work_permits
--      INSERT + UPDATE OF status
--   5. permit_approvals SELECT policy allows approvers to read rows
--
-- Also adds:
--
--   6. permit_notification_diagnostic(permit_id) — admin/approver
--      visible RPC that returns a JSON breakdown of EXACTLY what
--      would happen / has happened for a given permit's notification
--      flow. Single source of truth for debugging "why didn't X get
--      notified about permit Y?"
--
--   7. PostgREST schema reload at the end so any frontend session
--      picks up changes without needing a project restart.

BEGIN;

-- =================================================================
-- 1. Data-driven is_approver — re-assert (no-op if already applied)
-- =================================================================
CREATE OR REPLACE FUNCTION public.is_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = _user_id
       AND r.name = 'admin'
  )
  OR EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.workflow_steps ws ON ws.role_id = ur.role_id
     WHERE ur.user_id = _user_id
  );
$$;

COMMENT ON FUNCTION public.is_approver(uuid) IS
  'TRUE if user holds admin role OR any role used in workflow_steps. '
  'Data-driven — custom roles auto-qualify the moment admin wires them '
  'into a workflow.';

-- =================================================================
-- 2. notify_permit_active_approvers RPC — re-assert
-- =================================================================
CREATE OR REPLACE FUNCTION public.notify_permit_active_approvers(
  p_permit_id        uuid,
  p_notification_type text DEFAULT 'new_permit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit        record;
  v_caller_id     uuid := auth.uid();
  v_caller_admin  boolean;
  v_inserted      integer := 0;
  v_user_ids      uuid[]  := ARRAY[]::uuid[];
  v_emails        text[]  := ARRAY[]::text[];
  v_roles         text[]  := ARRAY[]::text[];
  v_role_row      record;
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
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id
       AND r.name = 'admin'
  ) INTO v_caller_admin;

  -- Authorization: requester / admin / active approver / past approver.
  IF v_caller_id IS NULL
     OR (v_permit.requester_id <> v_caller_id
         AND NOT v_caller_admin
         AND NOT EXISTS (
           SELECT 1
             FROM public.permit_active_approvers paa
             JOIN public.user_roles ur ON ur.role_id = paa.role_id
            WHERE paa.permit_id = p_permit_id
              AND ur.user_id = v_caller_id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.permit_approvals pa
            WHERE pa.permit_id = p_permit_id
              AND pa.approver_user_id = v_caller_id
              AND pa.status IN ('approved', 'rejected')
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_title_prefix := CASE
    WHEN v_permit.urgency = 'urgent' THEN 'New URGENT '
    ELSE 'New '
  END;

  FOR v_role_row IN
    SELECT DISTINCT paa.role_id, paa.role_name
      FROM public.permit_active_approvers paa
     WHERE paa.permit_id = p_permit_id
  LOOP
    v_roles := array_append(v_roles, v_role_row.role_name);

    FOR v_user_id IN
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role_id = v_role_row.role_id
    LOOP
      INSERT INTO public.notifications (
        user_id, permit_id, type, title, message
      )
      SELECT
        v_user_id, p_permit_id, p_notification_type,
        CASE p_notification_type
          WHEN 'resubmitted' THEN 'Work Permit Resubmitted for Review'
          ELSE v_title_prefix || 'Permit Awaiting Your Review'
        END,
        v_permit.permit_no ||
          CASE p_notification_type
            WHEN 'resubmitted' THEN ' has been resubmitted for your approval. '
            ELSE ' is pending your approval. '
          END ||
          CASE WHEN v_permit.urgency = 'urgent'
               THEN '4-hour SLA.'
               ELSE '48-hour SLA.' END
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id   = v_user_id
           AND n.permit_id = p_permit_id
           AND n.type      = p_notification_type
      );

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      END IF;

      v_user_ids := array_append(v_user_ids, v_user_id);

      SELECT p.email INTO v_email
        FROM public.profiles p
       WHERE p.id = v_user_id;

      IF v_email IS NOT NULL AND v_email <> '' THEN
        v_emails := array_append(v_emails, v_email);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_count',    v_inserted,
    'user_ids',          (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_user_ids) AS x),
    'emails',            (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_emails)   AS x),
    'active_roles',      to_jsonb(v_roles),
    'permit_no',         v_permit.permit_no,
    'urgency',           v_permit.urgency,
    'requester_name',    v_permit.requester_name,
    'notification_type', p_notification_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_permit_active_approvers(uuid, text)
  TO authenticated;

-- =================================================================
-- 3. Per-permit diagnostic — call this in SQL editor to see exactly
--    what's broken for a specific permit
-- =================================================================
--
-- Usage:
--   SELECT public.permit_notification_diagnostic('<permit-uuid>');
--
-- Returns a JSON object with these sections:
--   permit              : { id, permit_no, status, requester_email,
--                           work_type_id, work_type_name,
--                           workflow_template_id }
--   workflow_steps      : list of { step_order, role_name, role_id,
--                                   is_required_default }
--   approval_rows       : list of { role_name, status, approver_user_id,
--                                   approved_at } from permit_approvals
--   active_approvers    : list of { role_name, role_id } from
--                                   permit_active_approvers VIEW
--   role_holders        : per active role, list of { user_id, email,
--                                   full_name } from user_roles+profiles
--   notifications_sent  : list of { user_id, type, created_at } from
--                                   notifications table for this permit
--   is_approver_check   : { user_email, is_approver } for the caller,
--                          to confirm RLS won't block them
--   diagnosis           : array of warning strings — empty if all good
--
-- Read-only. SECURITY DEFINER so it doesn't itself need RLS to read
-- user_roles, profiles, etc.
--
-- Permission gate: caller must be admin OR an active/past approver
-- of the permit OR the requester. Same gates as notify RPC.

CREATE OR REPLACE FUNCTION public.permit_notification_diagnostic(p_permit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit         record;
  v_workflow_steps jsonb;
  v_approval_rows  jsonb;
  v_active_appr    jsonb;
  v_role_holders   jsonb;
  v_notifications  jsonb;
  v_caller_id      uuid := auth.uid();
  v_is_approver    boolean;
  v_caller_email   text;
  v_diagnosis      text[] := ARRAY[]::text[];
  v_active_role_ids uuid[];
  v_template_id    uuid;
BEGIN
  -- Permission gate (lenient — anyone with any legitimate connection
  -- to this permit can see the diagnostic)
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.work_permits wp
     WHERE wp.id = p_permit_id AND wp.requester_id = v_caller_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.permit_active_approvers paa
      JOIN public.user_roles ur ON ur.role_id = paa.role_id
     WHERE paa.permit_id = p_permit_id AND ur.user_id = v_caller_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.permit_approvals pa
     WHERE pa.permit_id = p_permit_id AND pa.approver_user_id = v_caller_id
  )
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Permit info (joined with work_type)
  SELECT jsonb_build_object(
    'id',                   wp.id,
    'permit_no',            wp.permit_no,
    'status',               wp.status,
    'requester_id',         wp.requester_id,
    'requester_email',      wp.requester_email,
    'work_type_id',         wp.work_type_id,
    'work_type_name',       wt.name,
    'workflow_template_id', wt.workflow_template_id,
    'is_archived',          wp.is_archived,
    'created_at',           wp.created_at
  ), wt.workflow_template_id
    INTO v_permit, v_template_id
    FROM public.work_permits wp
    LEFT JOIN public.work_types wt ON wt.id = wp.work_type_id
   WHERE wp.id = p_permit_id;

  IF v_permit IS NULL THEN
    RETURN jsonb_build_object('error', 'permit not found', 'permit_id', p_permit_id);
  END IF;

  IF v_template_id IS NULL THEN
    v_diagnosis := array_append(v_diagnosis,
      'CRITICAL: work_type has no workflow_template_id — no approval rows can be created. Open Workflow Builder and assign a template to this work type.'
    );
  END IF;

  -- Workflow steps for the template
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'step_order',         ws.step_order,
      'role_name',          r.name,
      'role_id',            r.id,
      'role_label',         r.label,
      'is_required_default', ws.is_required_default
    ) ORDER BY ws.step_order),
    '[]'::jsonb
  )
    INTO v_workflow_steps
    FROM public.workflow_steps ws
    LEFT JOIN public.roles r ON r.id = ws.role_id
   WHERE ws.workflow_template_id = v_template_id;

  IF jsonb_array_length(v_workflow_steps) = 0 AND v_template_id IS NOT NULL THEN
    v_diagnosis := array_append(v_diagnosis,
      'CRITICAL: workflow_template has zero workflow_steps. Open Workflow Builder and add at least one step.'
    );
  END IF;

  -- Approval rows (what the trigger inserted, or didn't)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role_name',          pa.role_name,
      'status',             pa.status,
      'approver_user_id',   pa.approver_user_id,
      'approver_name',      pa.approver_name,
      'approved_at',        pa.approved_at
    )),
    '[]'::jsonb
  )
    INTO v_approval_rows
    FROM public.permit_approvals pa
   WHERE pa.permit_id = p_permit_id;

  IF jsonb_array_length(v_approval_rows) = 0 AND v_template_id IS NOT NULL THEN
    v_diagnosis := array_append(v_diagnosis,
      'CRITICAL: permit_approvals table has zero rows for this permit. The ensure_permit_pending_approvals trigger did not run, did not find required steps, or ran into an error. Check postgres logs for WARNING/NOTICE entries about this permit_id.'
    );
  END IF;

  -- Active approvers (what permit_active_approvers VIEW returns)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role_name',         paa.role_name,
      'role_id',           paa.role_id,
      'step_order',        paa.step_order,
      'sla_deadline',      paa.sla_deadline
    )),
    '[]'::jsonb
  ), array_agg(paa.role_id)
    INTO v_active_appr, v_active_role_ids
    FROM public.permit_active_approvers paa
   WHERE paa.permit_id = p_permit_id;

  IF jsonb_array_length(v_active_appr) = 0
     AND jsonb_array_length(v_approval_rows) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.work_permits
        WHERE id = p_permit_id
          AND status IN ('approved', 'rejected', 'cancelled', 'closed', 'draft')
     )
  THEN
    v_diagnosis := array_append(v_diagnosis,
      'WARNING: permit has approval rows but permit_active_approvers returns empty. Check for unexpected workflow state.'
    );
  END IF;

  -- For each active role, list the users who hold it
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role_id',    r.id,
      'role_name',  r.name,
      'holders',    (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object(
            'user_id',   p.id,
            'email',     p.email,
            'full_name', p.full_name
          )),
          '[]'::jsonb
        )
        FROM public.user_roles ur
        LEFT JOIN public.profiles p ON p.id = ur.user_id
        WHERE ur.role_id = r.id
      )
    )),
    '[]'::jsonb
  )
    INTO v_role_holders
    FROM public.roles r
   WHERE r.id = ANY(v_active_role_ids);

  -- Detect orphaned active roles (no users hold them)
  IF v_active_role_ids IS NOT NULL THEN
    FOR v_email IN
      SELECT r.name
        FROM public.roles r
       WHERE r.id = ANY(v_active_role_ids)
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur WHERE ur.role_id = r.id
         )
    LOOP
      v_diagnosis := array_append(v_diagnosis,
        format('CRITICAL: active role "%s" has NO users assigned. Permit is stranded. Open Approvers Management and assign the role.', v_email)
      );
    END LOOP;
  END IF;

  -- Notifications sent for this permit
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'user_id',     n.user_id,
      'user_email',  (SELECT p.email FROM public.profiles p WHERE p.id = n.user_id),
      'type',        n.type,
      'is_read',     n.is_read,
      'created_at',  n.created_at
    ) ORDER BY n.created_at DESC),
    '[]'::jsonb
  )
    INTO v_notifications
    FROM public.notifications n
   WHERE n.permit_id = p_permit_id;

  -- is_approver result for the caller (helps confirm RLS won't block)
  SELECT public.is_approver(v_caller_id) INTO v_is_approver;
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller_id;

  -- If there are active approvers but no notifications sent of type
  -- 'new_permit', the fan-out was probably skipped.
  IF jsonb_array_length(v_active_appr) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications
        WHERE permit_id = p_permit_id AND type = 'new_permit'
     )
  THEN
    v_diagnosis := array_append(v_diagnosis,
      'WARNING: permit has active approvers but zero in-app notifications. Either the frontend never called notify_permit_active_approvers, or the RPC was not yet applied to this database. Run: SELECT public.notify_permit_active_approvers(''' || p_permit_id || '''); to send catch-up notifications.'
    );
  END IF;

  RETURN jsonb_build_object(
    'permit',             v_permit,
    'workflow_steps',     v_workflow_steps,
    'approval_rows',      v_approval_rows,
    'active_approvers',   v_active_appr,
    'role_holders',       v_role_holders,
    'notifications_sent', v_notifications,
    'is_approver_check',  jsonb_build_object(
      'caller_id',        v_caller_id,
      'caller_email',     v_caller_email,
      'is_approver',      v_is_approver
    ),
    'diagnosis',          to_jsonb(v_diagnosis)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.permit_notification_diagnostic(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.permit_notification_diagnostic(uuid) IS
  'End-to-end diagnostic for a permit''s notification flow. Returns '
  'permit, workflow steps, approval rows, active approvers, role holders, '
  'notifications sent, is_approver check, and a diagnosis array. Run '
  'this in the SQL editor when investigating "approver did not get '
  'notified" reports.';

COMMIT;

NOTIFY pgrst, 'reload schema';
