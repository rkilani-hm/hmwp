DROP POLICY IF EXISTS "On-behalf creators can view their permits" ON public.work_permits;
CREATE POLICY "On-behalf creators can view their permits" ON public.work_permits FOR SELECT TO authenticated USING (created_on_behalf_by = auth.uid());
DROP POLICY IF EXISTS "On-behalf creators can view their gate passes" ON public.gate_passes;
CREATE POLICY "On-behalf creators can view their gate passes" ON public.gate_passes FOR SELECT TO authenticated USING (created_on_behalf_by = auth.uid());

CREATE OR REPLACE FUNCTION public.get_my_action_role(p_permit_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT paa.role_name
  FROM public.permit_active_approvers paa
  LEFT JOIN public.workflow_steps ws ON ws.id = paa.workflow_step_id
  CROSS JOIN LATERAL (SELECT public.authorize_permit_approval(auth.uid(), p_permit_id, paa.role_name) AS a) z
  WHERE paa.permit_id = p_permit_id
    AND (z.a->>'allowed')::boolean
    AND ((z.a->>'is_direct')::boolean OR z.a->>'on_behalf_of_kind' IS NOT NULL)
  ORDER BY (z.a->>'is_direct')::boolean DESC, ws.step_order NULLS LAST, paa.role_name
  LIMIT 1;
$function$;