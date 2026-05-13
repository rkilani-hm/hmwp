-- Approver setup audit — per-role admin diagnostic
--
-- Complements the per-permit diagnose_permit_approvers(permit_id) function
-- shipped in migration 20260513250000_diagnose_permit_approvers.sql.
--
-- That function answers: "for THIS one permit, who should act and why
-- aren't they?". This migration adds:
--
--   1. approver_setup_audit VIEW — one row per role showing whether
--      the role is wired up correctly across the WHOLE system. Surfaces
--      orphaned roles (pending permits, no users assigned) that would
--      otherwise silently strand permits in nobody's inbox.
--
--   2. notify_pending_approvers_backfill() RPC — one-shot catch-up.
--      For every (permit, role) in permit_active_approvers that has
--      no in-app notification yet, insert one. Idempotent. Used after
--      an admin fixes a role assignment to retroactively populate the
--      inbox notification for already-pending permits.
--
--   3. RAISE NOTICE / RAISE WARNING on ensure_permit_pending_approvals
--      so postgres logs show exactly what the function did per call.
--      Most importantly, RAISE WARNING when a work_type has no
--      workflow_template_id (the single most common silent-failure
--      mode for "no approval rows were created").
--
-- ## Why per-role and per-permit?
--
-- Different questions, different answers:
--
--   "approver alhamracs@... reports they can't see ANY permits"
--     -> per-ROLE view: shows al_hamra_customer_service status across
--        all workflows + user assignments at a glance. Sorted
--        orphaned-first so the bug is the top row.
--
--   "specific permit WP-2026-1234 isn't reaching its approver"
--     -> per-PERMIT function (already shipped): drills into that one
--        permit's workflow + approval rows + role assignments.
--
-- Both views are SECURITY DEFINER / security_invoker so existing admin
-- RLS applies — only admins can read.

BEGIN;

-- ---------------------------------------------------------------
-- 1. approver_setup_audit view
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.approver_setup_audit
WITH (security_invoker = true) AS
WITH role_stats AS (
  SELECT
    r.id                                  AS role_id,
    r.name                                AS role_name,
    r.label                               AS role_label,
    r.is_active                           AS role_active,
    (SELECT COUNT(*) FROM public.workflow_steps ws WHERE ws.role_id = r.id)
                                          AS workflow_step_count,
    (SELECT COUNT(*) FROM public.user_roles ur WHERE ur.role_id = r.id)
                                          AS user_count,
    (SELECT COUNT(*)
       FROM public.permit_active_approvers paa
      WHERE paa.role_id = r.id)           AS pending_permit_count
  FROM public.roles r
)
SELECT
  rs.role_id,
  rs.role_name,
  rs.role_label,
  rs.role_active,
  rs.workflow_step_count,
  rs.user_count,
  rs.pending_permit_count,
  CASE
    WHEN rs.pending_permit_count > 0 AND rs.user_count = 0
      THEN 'orphaned_pending'
    WHEN rs.workflow_step_count > 0 AND rs.user_count = 0
      THEN 'no_users'
    WHEN rs.workflow_step_count = 0 AND rs.user_count > 0
      THEN 'no_workflow_steps'
    WHEN rs.workflow_step_count = 0 AND rs.user_count = 0
      THEN 'unused'
    ELSE 'ok'
  END AS status
FROM role_stats rs
WHERE rs.workflow_step_count > 0
   OR rs.user_count > 0
   OR rs.pending_permit_count > 0
ORDER BY
  CASE
    WHEN rs.pending_permit_count > 0 AND rs.user_count = 0 THEN 0
    WHEN rs.workflow_step_count > 0 AND rs.user_count = 0 THEN 1
    ELSE 2
  END,
  rs.role_name;

COMMENT ON VIEW public.approver_setup_audit IS
  'Per-role diagnostic. Each row: # workflow_steps, # users assigned, '
  '# pending permits, and a status (orphaned_pending / no_users / '
  'no_workflow_steps / unused / ok). Sorted worst-first.';

GRANT SELECT ON public.approver_setup_audit TO authenticated;

-- ---------------------------------------------------------------
-- 2. notify_pending_approvers_backfill()
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_pending_approvers_backfill()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_row record;
BEGIN
  -- Admin-only. Use the user_roles -> roles.name join because has_role
  -- expects an app_role enum value (which custom roles aren't part of).
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = auth.uid()
       AND r.name = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  FOR v_row IN
    SELECT
      paa.permit_id,
      paa.permit_no,
      paa.urgency,
      paa.role_id,
      paa.role_name,
      ur.user_id
    FROM public.permit_active_approvers paa
    JOIN public.user_roles ur ON ur.role_id = paa.role_id
    -- Only where there's NO 'new_permit' notification for this
    -- (user, permit) pair already.
    WHERE NOT EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.user_id = ur.user_id
         AND n.permit_id = paa.permit_id
         AND n.type = 'new_permit'
    )
  LOOP
    INSERT INTO public.notifications (
      user_id, permit_id, type, title, message
    )
    VALUES (
      v_row.user_id,
      v_row.permit_id,
      'new_permit',
      CASE
        WHEN v_row.urgency = 'urgent'
          THEN 'New URGENT Permit Awaiting Your Review'
        ELSE 'New Permit Awaiting Your Review'
      END,
      v_row.permit_no || ' is pending your approval. ' ||
        CASE WHEN v_row.urgency = 'urgent' THEN '4-hour SLA.' ELSE '48-hour SLA.' END
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.notify_pending_approvers_backfill() IS
  'Admin RPC. For every active pending approval that has no '
  '''new_permit'' notification yet, insert one. Idempotent.';

GRANT EXECUTE ON FUNCTION public.notify_pending_approvers_backfill() TO authenticated;

-- ---------------------------------------------------------------
-- 3. Observability on ensure_permit_pending_approvals
-- ---------------------------------------------------------------
--
-- The function exists from phase 2c-5a and runs silently. Adds
-- RAISE NOTICE on each call (so logs show count of rows inserted)
-- and RAISE WARNING when work_type has no workflow_template_id —
-- that's the single most common silent-failure mode for "no
-- approval rows were created". Function body otherwise unchanged.

CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals(p_permit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_permit record;
  v_wf_template uuid;
BEGIN
  SELECT wp.id, wp.work_type_id, wp.status, wp.is_archived,
         wt.workflow_template_id
    INTO v_permit
    FROM public.work_permits wp
    LEFT JOIN public.work_types wt ON wt.id = wp.work_type_id
   WHERE wp.id = p_permit_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'ensure_permit_pending_approvals: permit % not found', p_permit_id;
    RETURN 0;
  END IF;

  IF COALESCE(v_permit.is_archived, false) THEN
    RAISE NOTICE 'ensure_permit_pending_approvals: permit % is archived; skip', p_permit_id;
    RETURN 0;
  END IF;

  IF v_permit.status = 'draft' OR v_permit.status IS NULL THEN
    RAISE NOTICE 'ensure_permit_pending_approvals: permit % is draft; skip', p_permit_id;
    RETURN 0;
  END IF;

  v_wf_template := v_permit.workflow_template_id;

  IF v_wf_template IS NULL THEN
    -- The smoking gun for "approver doesn't see permit".
    RAISE WARNING
      'ensure_permit_pending_approvals: permit % work_type % has NO workflow_template_id — no approval rows will be created',
      p_permit_id, v_permit.work_type_id;
    RETURN 0;
  END IF;

  WITH step_list AS (
    SELECT
      ws.id                 AS step_id,
      ws.role_id,
      r.name                AS role_name,
      ws.step_order,
      COALESCE(
        pwo.is_required,
        wtsc.is_required,
        ws.is_required_default,
        (to_jsonb(wt.*) ->> ('requires_' || r.name))::boolean,
        true
      ) AS is_required
    FROM public.workflow_steps ws
    JOIN public.roles r ON r.id = ws.role_id
    LEFT JOIN public.permit_workflow_overrides pwo
      ON pwo.permit_id = p_permit_id AND pwo.workflow_step_id = ws.id
    LEFT JOIN public.work_type_step_config wtsc
      ON wtsc.work_type_id = v_permit.work_type_id
     AND wtsc.workflow_step_id = ws.id
    LEFT JOIN public.work_types wt ON wt.id = v_permit.work_type_id
    WHERE ws.workflow_template_id = v_wf_template
      AND r.name IS NOT NULL
  ),
  to_insert AS (
    INSERT INTO public.permit_approvals (
      permit_id, workflow_step_id, role_id, role_name, status
    )
    SELECT p_permit_id, sl.step_id, sl.role_id, sl.role_name, 'pending'
      FROM step_list sl
     WHERE sl.is_required = true
       AND NOT EXISTS (
         SELECT 1 FROM public.permit_approvals pa
          WHERE pa.permit_id = p_permit_id
            AND pa.role_name = sl.role_name
       )
    ON CONFLICT (permit_id, role_name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM to_insert;

  RAISE NOTICE
    'ensure_permit_pending_approvals: permit % inserted % pending approval rows (workflow_template %)',
    p_permit_id, v_inserted, v_wf_template;

  RETURN v_inserted;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
