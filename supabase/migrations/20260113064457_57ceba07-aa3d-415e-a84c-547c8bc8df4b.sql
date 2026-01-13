
-- Phase 1: Dynamic Workflow Builder Schema

-- 1.1 Create workflow_templates table
CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  workflow_type text NOT NULL CHECK (workflow_type IN ('internal', 'client')),
  description text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow_templates
CREATE POLICY "Admins can manage workflow_templates"
  ON public.workflow_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view active workflow_templates"
  ON public.workflow_templates FOR SELECT
  USING (is_active = true);

-- 1.2 Create workflow_steps table
CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  step_order integer NOT NULL,
  is_required_default boolean DEFAULT true,
  can_be_skipped boolean DEFAULT false,
  step_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workflow_template_id, step_order),
  UNIQUE (workflow_template_id, role_id)
);

-- Enable RLS
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflow_steps
CREATE POLICY "Admins can manage workflow_steps"
  ON public.workflow_steps FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view workflow_steps"
  ON public.workflow_steps FOR SELECT
  USING (true);

-- 1.3 Create work_type_step_config table (per-work-type overrides)
CREATE TABLE public.work_type_step_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type_id uuid NOT NULL REFERENCES public.work_types(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  is_required boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (work_type_id, workflow_step_id)
);

-- Enable RLS
ALTER TABLE public.work_type_step_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for work_type_step_config
CREATE POLICY "Admins can manage work_type_step_config"
  ON public.work_type_step_config FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view work_type_step_config"
  ON public.work_type_step_config FOR SELECT
  USING (true);

-- 1.4 Add new permit status enum values for new roles
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'pending_customer_service';
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'pending_cr_coordinator';
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'pending_head_cr';

-- 1.5 Add new approval tracking columns to work_permits for new roles
ALTER TABLE public.work_permits 
  ADD COLUMN IF NOT EXISTS customer_service_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_service_approver_name text,
  ADD COLUMN IF NOT EXISTS customer_service_approver_email text,
  ADD COLUMN IF NOT EXISTS customer_service_comments text,
  ADD COLUMN IF NOT EXISTS customer_service_signature text,
  ADD COLUMN IF NOT EXISTS customer_service_date timestamptz;

ALTER TABLE public.work_permits 
  ADD COLUMN IF NOT EXISTS cr_coordinator_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cr_coordinator_approver_name text,
  ADD COLUMN IF NOT EXISTS cr_coordinator_approver_email text,
  ADD COLUMN IF NOT EXISTS cr_coordinator_comments text,
  ADD COLUMN IF NOT EXISTS cr_coordinator_signature text,
  ADD COLUMN IF NOT EXISTS cr_coordinator_date timestamptz;

ALTER TABLE public.work_permits 
  ADD COLUMN IF NOT EXISTS head_cr_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS head_cr_approver_name text,
  ADD COLUMN IF NOT EXISTS head_cr_approver_email text,
  ADD COLUMN IF NOT EXISTS head_cr_comments text,
  ADD COLUMN IF NOT EXISTS head_cr_signature text,
  ADD COLUMN IF NOT EXISTS head_cr_date timestamptz;

-- 1.6 Add workflow_template_id to work_types
ALTER TABLE public.work_types 
  ADD COLUMN IF NOT EXISTS workflow_template_id uuid REFERENCES public.workflow_templates(id);

-- 1.7 Add triggers for updated_at
CREATE TRIGGER update_workflow_templates_updated_at
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.8 Add new roles for the workflow (customer_service, cr_coordinator, head_cr)
INSERT INTO public.roles (name, label, description, is_system, is_active)
VALUES 
  ('customer_service', 'Customer Service', 'First line approval for client permits', true, true),
  ('cr_coordinator', 'CR Coordinator', 'Customer Relations coordinator approval', true, true),
  ('head_cr', 'Head of CR', 'Head of Customer Relations approval', true, true)
ON CONFLICT (name) DO NOTHING;

-- 1.9 Update is_approver function to include new roles
CREATE OR REPLACE FUNCTION public.is_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.name IN (
        'customer_service', 'cr_coordinator', 'head_cr',
        'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 
        'soft_facilities', 'hard_facilities', 'pm_service', 'admin',
        'ecovert_supervisor', 'pmd_coordinator'
      )
  )
$$;

-- 1.10 Create helper function to get dynamic pending status from role name
CREATE OR REPLACE FUNCTION public.get_pending_status_for_role(role_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'pending_' || role_name
$$;
