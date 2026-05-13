-- ============================================================
-- Apply pending migrations:
--   20260514100000_consolidation_and_diagnostic.sql
--   20260514110000_forward_permit_rpc.sql
-- ============================================================

-- 1. Data-driven is_approver
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
  'TRUE if user holds admin role OR any role used in workflow_steps. Data-driven — custom roles auto-qualify the moment admin wires them into a workflow.';

-- 2. notify_permit_active_approvers RPC
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

GRANT EXECUTE ON FUNCTION public.notify_permit_active_approvers(uuid, text) TO authenticated;

-- 3. Per-permit diagnostic
CREATE OR REPLACE FUNCTION public.permit_notification_diagnostic(p_permit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit         jsonb;
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
  v_email          text;
BEGIN
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

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role_name',        pa.role_name,
      'status',           pa.status,
      'approver_user_id', pa.approver_user_id,
      'approver_name',    pa.approver_name,
      'approved_at',      pa.approved_at
    )),
    '[]'::jsonb
  )
    INTO v_approval_rows
    FROM public.permit_approvals pa
   WHERE pa.permit_id = p_permit_id;

  IF jsonb_array_length(v_approval_rows) = 0 THEN
    v_diagnosis := array_append(v_diagnosis,
      'WARNING: permit has zero permit_approvals rows. ensure_permit_pending_approvals trigger may not have fired. Try: SELECT public.ensure_permit_pending_approvals(''' || p_permit_id || ''');'
    );
  END IF;

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
          AND status::text IN ('approved', 'rejected', 'cancelled', 'closed', 'draft')
     )
  THEN
    v_diagnosis := array_append(v_diagnosis,
      'WARNING: permit has approval rows but permit_active_approvers returns empty. Check for unexpected workflow state.'
    );
  END IF;

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

  SELECT public.is_approver(v_caller_id) INTO v_is_approver;
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller_id;

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

GRANT EXECUTE ON FUNCTION public.permit_notification_diagnostic(uuid) TO authenticated;

COMMENT ON FUNCTION public.permit_notification_diagnostic(uuid) IS
  'End-to-end diagnostic for a permit''s notification flow.';

-- 4. forward_permit_to_role RPC
CREATE OR REPLACE FUNCTION public.forward_permit_to_role(
  p_permit_id        uuid,
  p_target_role_name text,
  p_reason           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit       record;
  v_caller_id    uuid := auth.uid();
  v_caller_admin boolean;
  v_target_role  record;
  v_workflow_step_id uuid;
  v_new_status   text;
  v_caller_name  text;
  v_skipped      integer := 0;
BEGIN
  SELECT id, permit_no, status, work_type_id, is_archived, requester_id
    INTO v_permit
    FROM public.work_permits
   WHERE id = p_permit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit not found: %', p_permit_id;
  END IF;

  IF COALESCE(v_permit.is_archived, false) THEN
    RAISE EXCEPTION 'permit is archived';
  END IF;

  IF v_permit.status::text IN ('approved', 'rejected', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'cannot forward terminal-state permit (status=%)', v_permit.status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF NOT v_caller_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.permit_active_approvers paa
        JOIN public.user_roles ur ON ur.role_id = paa.role_id
       WHERE paa.permit_id = p_permit_id AND ur.user_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'permission denied — must be admin or active approver to forward';
    END IF;
  END IF;

  SELECT id, name, label INTO v_target_role
    FROM public.roles
   WHERE name = p_target_role_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown target role: %', p_target_role_name;
  END IF;

  SELECT ws.id INTO v_workflow_step_id
    FROM public.workflow_steps ws
    JOIN public.work_types wt ON wt.workflow_template_id = ws.workflow_template_id
   WHERE wt.id = v_permit.work_type_id
     AND ws.role_id = v_target_role.id
   LIMIT 1;

  UPDATE public.permit_approvals
     SET status = 'skipped',
         updated_at = now()
   WHERE permit_id = p_permit_id
     AND status = 'pending';
  GET DIAGNOSTICS v_skipped = ROW_COUNT;

  INSERT INTO public.permit_approvals (
    permit_id, workflow_step_id, role_id, role_name, status
  )
  VALUES (
    p_permit_id, v_workflow_step_id, v_target_role.id, v_target_role.name, 'pending'
  )
  ON CONFLICT (permit_id, role_name) DO UPDATE
    SET status = 'pending',
        approver_user_id = NULL,
        approver_name    = NULL,
        approver_email   = NULL,
        approved_at      = NULL,
        comments         = NULL,
        signature        = NULL,
        workflow_step_id = COALESCE(EXCLUDED.workflow_step_id,
                                    public.permit_approvals.workflow_step_id),
        updated_at       = now();

  v_new_status := 'pending_' || v_target_role.name;

  BEGIN
    UPDATE public.work_permits
       SET status = v_new_status::permit_status,
           updated_at = now()
     WHERE id = p_permit_id;
  EXCEPTION WHEN invalid_text_representation OR check_violation THEN
    RAISE NOTICE 'pending_<role> enum value not found for %, falling back to under_review', v_target_role.name;
    UPDATE public.work_permits
       SET status = 'under_review'::permit_status,
           updated_at = now()
     WHERE id = p_permit_id;
  END;

  SELECT full_name INTO v_caller_name
    FROM public.profiles
   WHERE id = v_caller_id;

  INSERT INTO public.activity_logs (
    permit_id, action, performed_by, performed_by_id, details
  )
  VALUES (
    p_permit_id,
    'Forwarded',
    COALESCE(v_caller_name, 'Unknown'),
    v_caller_id,
    'Forwarded to ' || v_target_role.name ||
      CASE WHEN p_reason IS NOT NULL AND p_reason <> ''
           THEN ' — ' || p_reason
           ELSE '' END
  );

  RETURN jsonb_build_object(
    'permit_id',             p_permit_id,
    'permit_no',             v_permit.permit_no,
    'target_role',           v_target_role.name,
    'target_role_label',     v_target_role.label,
    'new_status',            v_new_status,
    'previous_pending_skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.forward_permit_to_role(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.forward_permit_to_role(uuid, text, text) IS
  'Forward a permit to a different approver role. Updates permit_approvals (marks prior pending as skipped, inserts/updates pending row for target), updates work_permits.status, logs activity.';

NOTIFY pgrst, 'reload schema';
