-- Seed default workflow templates for internal and client approval flows

-- Create Internal Workflow Template
INSERT INTO public.workflow_templates (id, name, workflow_type, description, is_active, is_default)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Internal Permit Workflow',
  'internal',
  'Default approval workflow for internal permit requests. Starts with Helpdesk review, then PM, followed by optional department approvals.',
  true,
  true
)
ON CONFLICT DO NOTHING;

-- Create Client Workflow Template
INSERT INTO public.workflow_templates (id, name, workflow_type, description, is_active, is_default)
VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'Client Permit Workflow',
  'client',
  'Default approval workflow for client/external permit requests. Starts with Customer Service, then CR Coordinator, Head of CR, PM, followed by optional department approvals.',
  true,
  true
)
ON CONFLICT DO NOTHING;

-- Get role IDs for workflow steps
-- We'll use a DO block to insert steps with proper role references

DO $$
DECLARE
  v_internal_template_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_client_template_id uuid := 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
  v_helpdesk_role_id uuid;
  v_customer_service_role_id uuid;
  v_cr_coordinator_role_id uuid;
  v_head_cr_role_id uuid;
  v_pm_role_id uuid;
  v_pd_role_id uuid;
  v_bdcr_role_id uuid;
  v_mpr_role_id uuid;
  v_it_role_id uuid;
  v_fitout_role_id uuid;
  v_ecovert_supervisor_role_id uuid;
  v_pmd_coordinator_role_id uuid;
BEGIN
  -- Get role IDs (create if they don't exist)
  
  -- Helpdesk
  SELECT id INTO v_helpdesk_role_id FROM public.roles WHERE name = 'helpdesk';
  IF v_helpdesk_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('helpdesk', 'Helpdesk', 'Helpdesk staff for initial permit review', true, true)
    RETURNING id INTO v_helpdesk_role_id;
  END IF;

  -- Customer Service
  SELECT id INTO v_customer_service_role_id FROM public.roles WHERE name = 'customer_service';
  IF v_customer_service_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('customer_service', 'Customer Service', 'Customer service staff for client permit intake', true, true)
    RETURNING id INTO v_customer_service_role_id;
  END IF;

  -- CR Coordinator
  SELECT id INTO v_cr_coordinator_role_id FROM public.roles WHERE name = 'cr_coordinator';
  IF v_cr_coordinator_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('cr_coordinator', 'CR Coordinator', 'Customer Relations Coordinator', true, true)
    RETURNING id INTO v_cr_coordinator_role_id;
  END IF;

  -- Head CR
  SELECT id INTO v_head_cr_role_id FROM public.roles WHERE name = 'head_cr';
  IF v_head_cr_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('head_cr', 'Head of CR', 'Head of Customer Relations', true, true)
    RETURNING id INTO v_head_cr_role_id;
  END IF;

  -- PM
  SELECT id INTO v_pm_role_id FROM public.roles WHERE name = 'pm';
  IF v_pm_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('pm', 'Property Manager', 'Property Manager for permit approvals', true, true)
    RETURNING id INTO v_pm_role_id;
  END IF;

  -- PD
  SELECT id INTO v_pd_role_id FROM public.roles WHERE name = 'pd';
  IF v_pd_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('pd', 'Property Director', 'Property Director for permit approvals', true, true)
    RETURNING id INTO v_pd_role_id;
  END IF;

  -- BDCR
  SELECT id INTO v_bdcr_role_id FROM public.roles WHERE name = 'bdcr';
  IF v_bdcr_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('bdcr', 'BDCR', 'Building Design & Construction Review', true, true)
    RETURNING id INTO v_bdcr_role_id;
  END IF;

  -- MPR
  SELECT id INTO v_mpr_role_id FROM public.roles WHERE name = 'mpr';
  IF v_mpr_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('mpr', 'MPR', 'Maintenance & Property Review', true, true)
    RETURNING id INTO v_mpr_role_id;
  END IF;

  -- IT
  SELECT id INTO v_it_role_id FROM public.roles WHERE name = 'it';
  IF v_it_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('it', 'IT Department', 'IT Department for technical approvals', true, true)
    RETURNING id INTO v_it_role_id;
  END IF;

  -- Fit-Out
  SELECT id INTO v_fitout_role_id FROM public.roles WHERE name = 'fitout';
  IF v_fitout_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('fitout', 'Fit-Out', 'Fit-Out Department for construction approvals', true, true)
    RETURNING id INTO v_fitout_role_id;
  END IF;

  -- Ecovert Supervisor
  SELECT id INTO v_ecovert_supervisor_role_id FROM public.roles WHERE name = 'ecovert_supervisor';
  IF v_ecovert_supervisor_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('ecovert_supervisor', 'Ecovert Supervisor', 'Ecovert Supervisor for environmental compliance', true, true)
    RETURNING id INTO v_ecovert_supervisor_role_id;
  END IF;

  -- PMD Coordinator
  SELECT id INTO v_pmd_coordinator_role_id FROM public.roles WHERE name = 'pmd_coordinator';
  IF v_pmd_coordinator_role_id IS NULL THEN
    INSERT INTO public.roles (name, label, description, is_system, is_active)
    VALUES ('pmd_coordinator', 'PMD Coordinator', 'Property Management Division Coordinator', true, true)
    RETURNING id INTO v_pmd_coordinator_role_id;
  END IF;

  -- Clear existing steps for these templates to avoid duplicates
  DELETE FROM public.workflow_steps WHERE workflow_template_id IN (v_internal_template_id, v_client_template_id);

  -- Insert Internal Workflow Steps
  -- Order: Helpdesk → PM → PD → BDCR → MPR → IT → Fit-Out → Ecovert Supervisor → PMD Coordinator
  INSERT INTO public.workflow_steps (workflow_template_id, role_id, step_order, step_name, is_required_default, can_be_skipped)
  VALUES
    (v_internal_template_id, v_helpdesk_role_id, 1, 'Helpdesk Review', true, false),
    (v_internal_template_id, v_pm_role_id, 2, 'PM Approval', true, false),
    (v_internal_template_id, v_pd_role_id, 3, 'PD Approval', false, true),
    (v_internal_template_id, v_bdcr_role_id, 4, 'BDCR Approval', false, true),
    (v_internal_template_id, v_mpr_role_id, 5, 'MPR Approval', false, true),
    (v_internal_template_id, v_it_role_id, 6, 'IT Approval', false, true),
    (v_internal_template_id, v_fitout_role_id, 7, 'Fit-Out Approval', false, true),
    (v_internal_template_id, v_ecovert_supervisor_role_id, 8, 'Ecovert Supervisor Approval', false, true),
    (v_internal_template_id, v_pmd_coordinator_role_id, 9, 'PMD Coordinator Approval', false, true);

  -- Insert Client Workflow Steps
  -- Order: Customer Service → CR Coordinator → Head CR → PM → PD → BDCR → MPR → IT → Fit-Out → Ecovert Supervisor → PMD Coordinator
  INSERT INTO public.workflow_steps (workflow_template_id, role_id, step_order, step_name, is_required_default, can_be_skipped)
  VALUES
    (v_client_template_id, v_customer_service_role_id, 1, 'Customer Service Review', true, false),
    (v_client_template_id, v_cr_coordinator_role_id, 2, 'CR Coordinator Review', true, false),
    (v_client_template_id, v_head_cr_role_id, 3, 'Head of CR Approval', true, false),
    (v_client_template_id, v_pm_role_id, 4, 'PM Approval', true, false),
    (v_client_template_id, v_pd_role_id, 5, 'PD Approval', false, true),
    (v_client_template_id, v_bdcr_role_id, 6, 'BDCR Approval', false, true),
    (v_client_template_id, v_mpr_role_id, 7, 'MPR Approval', false, true),
    (v_client_template_id, v_it_role_id, 8, 'IT Approval', false, true),
    (v_client_template_id, v_fitout_role_id, 9, 'Fit-Out Approval', false, true),
    (v_client_template_id, v_ecovert_supervisor_role_id, 10, 'Ecovert Supervisor Approval', false, true),
    (v_client_template_id, v_pmd_coordinator_role_id, 11, 'PMD Coordinator Approval', false, true);

  -- Update existing work types to use the appropriate workflow template
  -- Internal work types get the internal template, client work types get the client template
  -- We'll default all existing work types to the internal template if they don't have one assigned
  UPDATE public.work_types
  SET workflow_template_id = v_internal_template_id
  WHERE workflow_template_id IS NULL;

END $$;