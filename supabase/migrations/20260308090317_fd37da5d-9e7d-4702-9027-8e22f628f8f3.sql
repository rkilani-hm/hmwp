
-- Table to map gate pass types to workflow templates
CREATE TABLE public.gate_pass_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_type text NOT NULL UNIQUE,
  workflow_template_id uuid REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gate_pass_type_workflows ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage gate_pass_type_workflows"
  ON public.gate_pass_type_workflows
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view
CREATE POLICY "Authenticated users can view gate_pass_type_workflows"
  ON public.gate_pass_type_workflows
  FOR SELECT
  USING (true);

-- Seed all pass types with null workflow (to be configured by admin)
INSERT INTO public.gate_pass_type_workflows (pass_type) VALUES
  ('material_out'),
  ('material_in'),
  ('asset_transfer'),
  ('scrap_disposal'),
  ('contractor_tools'),
  ('internal_shifting');
