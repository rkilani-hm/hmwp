DROP VIEW IF EXISTS public.permit_pending_approvals;
DROP VIEW IF EXISTS public.gate_pass_pending_approvals;

CREATE VIEW public.permit_pending_approvals
WITH (security_invoker = true) AS
SELECT pa.*, wp.permit_no, wp.requester_name, wp.status AS permit_status, wp.sla_deadline, wp.urgency
FROM public.permit_approvals pa
JOIN public.work_permits wp ON wp.id = pa.permit_id
WHERE pa.status = 'pending' AND NOT COALESCE(wp.is_archived, false);

CREATE VIEW public.gate_pass_pending_approvals
WITH (security_invoker = true) AS
SELECT ga.*, gp.pass_no, gp.requester_name, gp.status AS pass_status, gp.pass_type, gp.has_high_value_asset
FROM public.gate_pass_approvals ga
JOIN public.gate_passes gp ON gp.id = ga.gate_pass_id
WHERE ga.status = 'pending' AND NOT COALESCE(gp.is_archived, false);

GRANT SELECT ON public.permit_pending_approvals TO authenticated;
GRANT SELECT ON public.gate_pass_pending_approvals TO authenticated;