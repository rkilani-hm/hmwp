-- Tighten anonymous read access on workflow config tables
DROP POLICY IF EXISTS "Authenticated users can view workflow_steps" ON public.workflow_steps;
CREATE POLICY "Authenticated users can view workflow_steps"
  ON public.workflow_steps FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view work_type_step_config" ON public.work_type_step_config;
CREATE POLICY "Authenticated users can view work_type_step_config"
  ON public.work_type_step_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view gate_pass_type_workflows" ON public.gate_pass_type_workflows;
CREATE POLICY "Authenticated users can view gate_pass_type_workflows"
  ON public.gate_pass_type_workflows FOR SELECT TO authenticated USING (true);

-- workflow_templates: find existing public-role select policy and recreate as authenticated
DROP POLICY IF EXISTS "Authenticated users can view workflow_templates" ON public.workflow_templates;
DROP POLICY IF EXISTS "Authenticated view workflow_templates" ON public.workflow_templates;
DROP POLICY IF EXISTS "Anyone can view workflow_templates" ON public.workflow_templates;
CREATE POLICY "Authenticated users can view workflow_templates"
  ON public.workflow_templates FOR SELECT TO authenticated USING (is_active = true);

-- Allow requesters to view workflow overrides on their own permits
CREATE POLICY "Requesters can view overrides on own permits"
  ON public.permit_workflow_overrides FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_permits wp
    WHERE wp.id = permit_workflow_overrides.permit_id
      AND (wp.requester_id = auth.uid() OR same_company(auth.uid(), wp.requester_id))
  ));
