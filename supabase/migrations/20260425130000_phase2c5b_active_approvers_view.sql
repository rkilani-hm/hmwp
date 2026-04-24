-- ============================================================================
-- Phase 2c-5b: active-approver view
--
-- permit_pending_approvals (from Phase 2a, populated by Phase 2c-5a) returns
-- ALL pending approval rows for every active permit. For a permit with a
-- 5-step workflow where nobody has acted yet, that's 5 rows — one per step.
--
-- The inbox should only show a permit in PM's inbox when PM is CURRENTLY
-- the next approver — not when helpdesk is pending before PM. This view
-- filters pending rows to the "active" step: a role is active for a
-- permit iff no earlier required step has a pending row.
--
-- Used by: usePendingPermitsForApprover, usePendingPermitsCount in 2c-5b.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS public.permit_active_approvers;

CREATE VIEW public.permit_active_approvers
WITH (security_invoker = true) AS
SELECT
  pa.id                     AS approval_id,
  pa.permit_id              AS permit_id,
  pa.workflow_step_id       AS workflow_step_id,
  pa.role_id                AS role_id,
  pa.role_name              AS role_name,
  ws.step_order             AS step_order,
  wp.permit_no              AS permit_no,
  wp.status                 AS permit_status,
  wp.requester_name         AS requester_name,
  wp.sla_deadline           AS sla_deadline,
  wp.urgency                AS urgency,
  wp.created_at             AS permit_created_at
FROM public.permit_approvals pa
JOIN public.work_permits wp ON wp.id = pa.permit_id
LEFT JOIN public.workflow_steps ws ON ws.id = pa.workflow_step_id
WHERE pa.status = 'pending'
  AND NOT COALESCE(wp.is_archived, false)
  -- The permit status must not be a terminal state. Approved and rejected
  -- permits shouldn't generate inbox items even if pending rows linger.
  AND wp.status NOT IN ('approved', 'rejected', 'cancelled', 'completed', 'draft')
  -- Suppress pending rows behind an earlier unapproved required step:
  -- a role is "active" only if no earlier step on the same permit has a
  -- pending row.
  AND NOT EXISTS (
    SELECT 1
      FROM public.permit_approvals pa_earlier
      JOIN public.workflow_steps ws_earlier ON ws_earlier.id = pa_earlier.workflow_step_id
     WHERE pa_earlier.permit_id = pa.permit_id
       AND pa_earlier.status = 'pending'
       AND ws_earlier.step_order IS NOT NULL
       AND ws.step_order IS NOT NULL
       AND ws_earlier.step_order < ws.step_order
  );

COMMENT ON VIEW public.permit_active_approvers IS
  'Phase 2c-5b: pending approval rows filtered to the "currently active" '
  'step per permit. A row appears here iff its step has no earlier pending '
  'step on the same permit (i.e. it is the role that should act next). '
  'Used by the inbox to surface only the permits a given role should see. '
  'security_invoker respects RLS on the underlying permit_approvals table.';

GRANT SELECT ON public.permit_active_approvers TO authenticated;

COMMIT;
