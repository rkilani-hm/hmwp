-- Phase 2c-5b: permit_active_approvers view
-- Surfaces only pending permit_approvals rows that are CURRENTLY actionable:
--   * permit not archived
--   * permit not in a terminal/draft status
--   * no earlier (lower step_order) pending required step on the same permit

DROP VIEW IF EXISTS public.permit_active_approvers;

CREATE VIEW public.permit_active_approvers
WITH (security_invoker = true) AS
SELECT
  pa.id                AS approval_id,
  pa.permit_id,
  pa.role_name,
  pa.role_id,
  pa.workflow_step_id,
  pa.status,
  pa.created_at,
  pa.updated_at,
  wp.permit_no,
  wp.status            AS permit_status,
  wp.requester_id,
  wp.requester_name,
  wp.requester_email,
  wp.contractor_name,
  wp.work_type_id,
  wp.work_description,
  wp.work_location,
  wp.work_date_from,
  wp.work_date_to,
  wp.urgency,
  wp.sla_deadline,
  wp.sla_breached,
  wp.is_archived,
  wp.created_at        AS permit_created_at,
  wp.updated_at        AS permit_updated_at
FROM public.permit_approvals pa
JOIN public.work_permits wp ON wp.id = pa.permit_id
LEFT JOIN public.workflow_steps ws_self ON ws_self.id = pa.workflow_step_id
WHERE pa.status = 'pending'
  AND NOT COALESCE(wp.is_archived, false)
  AND wp.status::text NOT IN ('approved', 'rejected', 'cancelled', 'closed', 'superseded', 'draft')
  AND NOT EXISTS (
    SELECT 1
    FROM public.permit_approvals pa_earlier
    JOIN public.workflow_steps ws_earlier
      ON ws_earlier.id = pa_earlier.workflow_step_id
    WHERE pa_earlier.permit_id = pa.permit_id
      AND pa_earlier.status = 'pending'
      AND pa_earlier.id <> pa.id
      AND ws_self.step_order IS NOT NULL
      AND ws_earlier.step_order IS NOT NULL
      AND ws_earlier.step_order < ws_self.step_order
  );

COMMENT ON VIEW public.permit_active_approvers IS
  'Phase 2c-5b: pending permit_approvals rows that are currently actionable (no earlier pending step on the same permit). Drives approver inbox.';