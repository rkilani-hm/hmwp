CREATE OR REPLACE FUNCTION public.get_work_permit_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'draft', count(*) FILTER (WHERE status::text = 'draft'),
    'pending', count(*) FILTER (WHERE status::text LIKE 'pending%' OR status::text IN ('submitted','under_review','rework_needed')),
    'approved', count(*) FILTER (WHERE status::text = 'approved'),
    'rejected', count(*) FILTER (WHERE status::text = 'rejected'),
    'closed', count(*) FILTER (WHERE status::text = 'closed'),
    'cancelled', count(*) FILTER (WHERE status::text IN ('cancelled','superseded')),
    'sla_breached', count(*) FILTER (WHERE sla_breached IS TRUE),
    'urgent', count(*) FILTER (WHERE urgency = 'urgent')
  ) FROM public.work_permits;
$$;
REVOKE EXECUTE ON FUNCTION public.get_work_permit_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_work_permit_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_gate_pass_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'pending', count(*) FILTER (WHERE status::text LIKE 'pending%'),
    'approved', count(*) FILTER (WHERE status::text = 'approved'),
    'rejected', count(*) FILTER (WHERE status::text = 'rejected'),
    'completed', count(*) FILTER (WHERE status::text = 'completed'),
    'draft', count(*) FILTER (WHERE status::text = 'draft')
  ) FROM public.gate_passes;
$$;
REVOKE EXECUTE ON FUNCTION public.get_gate_pass_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gate_pass_stats() TO authenticated, service_role;