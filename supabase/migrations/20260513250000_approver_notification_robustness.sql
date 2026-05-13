-- Approver notification robustness
--
-- ## Background
--
-- Approvers (especially newly-introduced custom roles like
-- al_hamra_customer_service) were reportedly NOT seeing permits in
-- their inbox and not receiving email notifications. Investigation
-- traced the issue to one or both of these conditions in production:
--
--   (a) The user account holding the approver role had no row in
--       user_roles for that role (admin forgot to assign).
--   (b) The workflow_steps table had no entry for the role on the
--       relevant work_type's workflow_template (admin created the
--       role but didn't add it to a workflow).
--   (c) Notifications fan-out in useCreatePermit used a derived
--       'first step' computation that diverged from what the DB
--       trigger actually inserted into permit_approvals — custom
--       roles that the derived computation missed got zero notification.
--
-- (c) is being fixed in the same PR by refactoring the frontend to
-- read permit_active_approvers (the canonical source of truth) for
-- the fan-out targets. This migration covers (a) and (b):
--
--   1. A diagnostic VIEW that surfaces, per role:
--        - # of workflow_steps referencing the role
--        - # of users assigned to the role (direct or delegated)
--        - # of currently-pending permit approvals waiting for the role
--        - status: 'ok', 'no_users', 'no_workflow_steps', 'orphaned'
--      Admins query this to find the exact gap.
--
--   2. A backfill RPC notify_pending_approvers_backfill() that fans
--      out in-app notifications for every currently-active pending
--      approval that has no notification yet. Used as a one-shot
--      catch-up: admin clicks 'Send missing notifications' in the
--      diagnostic page; permits that fell through the cracks now
--      generate inbox-visible notifications.
--
--   3. NOTE-level logging on ensure_permit_pending_approvals so each
--      permit submission leaves a trail in postgres logs about how
--      many pending rows it inserted — easy to confirm the trigger
--      is firing for the user's permit.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Diagnostic view: approver_setup_audit
-- ---------------------------------------------------------------
--
-- Returns one row per role that has any of:
--   - a workflow_steps entry
--   - a user assigned
--   - a pending permit_approvals row
--
-- Status interpretation:
--   ok                  -- has workflow_steps, users, no orphaned pending
--   no_users            -- role is on a workflow but nobody holds it →
--                          pending permits sit forever; bad
--   no_workflow_steps   -- users hold the role but no workflow uses it →
--                          role is dormant; possibly stale
--   orphaned_pending    -- pending permits waiting for the role but
--                          nobody holds it; CRITICAL — admin must fix
--
-- security_invoker so the existing 'admin can read everything' RLS
-- pattern applies (only admins can query this).

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
  'Per-role diagnostic showing workflow-step count, user count, and '
  'pending permit count. Surfaces orphaned roles where permits are '
  'waiting but no user holds the role. Admin-readable via existing RLS.';

GRANT SELECT ON public.approver_setup_audit TO authenticated;

-- ---------------------------------------------------------------
-- 2. Backfill RPC: notify_pending_approvers_backfill
-- ---------------------------------------------------------------
--
-- For every (permit, role) in permit_active_approvers where no
-- 'new_permit' notification exists for any user holding that role,
-- insert one. Catch-up tool for permits that didn't get notifications
-- at submission time (e.g. before this fix shipped, or if a transient
-- error broke the fan-out).
--
-- Returns the number of notifications inserted.
--
-- Idempotent: skips rows where a notification for this user_id +
-- permit_id + type='new_permit' already exists.

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
  -- Must be admin. has_role takes app_role enum so we check via name.
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
    -- (user, permit) pair already
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
  'Admin RPC: inserts in-app notifications for every currently-pending '
  'permit approval that has no notification for the assigned users yet. '
  'Idempotent. Returns count inserted.';

GRANT EXECUTE ON FUNCTION public.notify_pending_approvers_backfill() TO authenticated;

-- ---------------------------------------------------------------
-- 3. Observability: add NOTICE logging to ensure_permit_pending_approvals
-- ---------------------------------------------------------------
--
-- The function exists but runs silently. Adding RAISE NOTICE makes it
-- straightforward to confirm from postgres logs that a particular
-- permit's pending rows were inserted (and how many).
--
-- Full function body is preserved unchanged below — only NOTICE
-- additions are new.

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
    -- This is the smoking gun for "approver doesn't see permit" — the
    -- work_type has no workflow template, so no permit_approvals rows
    -- get inserted, so the inbox view shows nothing.
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
