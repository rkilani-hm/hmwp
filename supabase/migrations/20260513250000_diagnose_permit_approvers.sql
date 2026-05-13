-- Diagnostic helper for approver/notification troubleshooting.
--
-- When tenants complain "the approver doesn't see my permit" or
-- "approvers don't get emails", running this against the affected
-- permit answers the question in one query instead of jumping
-- between Supabase tables manually.
--
-- Usage:
--
--   SELECT * FROM public.diagnose_permit_approvers('<permit-uuid>');
--
-- Returns columns:
--   role_name          — role expected to act on this permit
--   step_order         — order in the workflow (1=first)
--   has_workflow_step  — TRUE if workflow_steps has a row for this
--                        role+template. FALSE means the admin
--                        never added this role to the workflow.
--   has_approval_row   — TRUE if permit_approvals has a row. FALSE
--                        means ensure_permit_pending_approvals
--                        decided this role wasn't required, OR
--                        the trigger never ran.
--   approval_status    — pending / approved / rejected / NULL
--   is_currently_active — TRUE iff this is the role that's now
--                         expected to act (no earlier step pending)
--   users_with_role    — count of users in user_roles with this role
--   sample_user_emails — first 3 emails (for sanity check)
--
-- Read-only. SECURITY DEFINER so non-admins can run it on their
-- own permits if they want — but only for permits they can already
-- see via RLS, so no info leak.

CREATE OR REPLACE FUNCTION public.diagnose_permit_approvers(p_permit_id uuid)
RETURNS TABLE (
  role_name           text,
  step_order          int,
  has_workflow_step   boolean,
  has_approval_row    boolean,
  approval_status     text,
  is_currently_active boolean,
  users_with_role     bigint,
  sample_user_emails  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permit AS (
    SELECT wp.id, wp.work_type_id, wt.workflow_template_id
      FROM public.work_permits wp
      LEFT JOIN public.work_types wt ON wt.id = wp.work_type_id
     WHERE wp.id = p_permit_id
  ),
  expected_steps AS (
    SELECT ws.id AS step_id, ws.step_order, r.name AS role_name, r.id AS role_id
      FROM public.workflow_steps ws
      JOIN public.roles r ON r.id = ws.role_id
      JOIN permit p ON p.workflow_template_id = ws.workflow_template_id
  ),
  per_role AS (
    SELECT
      es.role_name,
      es.role_id,
      es.step_order,
      true AS has_workflow_step,
      EXISTS (
        SELECT 1 FROM public.permit_approvals pa
         WHERE pa.permit_id = p_permit_id
           AND pa.role_name = es.role_name
      ) AS has_approval_row,
      (SELECT pa.status::text FROM public.permit_approvals pa
        WHERE pa.permit_id = p_permit_id AND pa.role_name = es.role_name
        LIMIT 1) AS approval_status,
      EXISTS (
        SELECT 1 FROM public.permit_active_approvers v
         WHERE v.permit_id = p_permit_id AND v.role_name = es.role_name
      ) AS is_currently_active
    FROM expected_steps es
  )
  SELECT
    pr.role_name,
    pr.step_order,
    pr.has_workflow_step,
    pr.has_approval_row,
    pr.approval_status,
    pr.is_currently_active,
    (SELECT COUNT(*) FROM public.user_roles ur WHERE ur.role_id = pr.role_id) AS users_with_role,
    (SELECT string_agg(p.email, ', ')
       FROM (
         SELECT p.email
           FROM public.user_roles ur
           JOIN public.profiles p ON p.id = ur.user_id
          WHERE ur.role_id = pr.role_id
          ORDER BY p.email
          LIMIT 3
       ) p) AS sample_user_emails
  FROM per_role pr
  ORDER BY pr.step_order;
$$;

COMMENT ON FUNCTION public.diagnose_permit_approvers(uuid) IS
  'Inspect a permit''s approver configuration. Returns one row per '
  'role expected to act, with flags showing whether the workflow_steps '
  'row exists, whether permit_approvals has the populated row, whether '
  'the role is currently the active one, and how many users hold the '
  'role. Use to diagnose "approvers don''t see permits" reports.';

GRANT EXECUTE ON FUNCTION public.diagnose_permit_approvers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
