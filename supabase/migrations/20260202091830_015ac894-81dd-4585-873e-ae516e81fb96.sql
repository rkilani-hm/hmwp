-- Create table for permit-specific workflow overrides
CREATE TABLE public.permit_workflow_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  is_required boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(permit_id, workflow_step_id)
);

-- RLS policies for permit_workflow_overrides
ALTER TABLE public.permit_workflow_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can view overrides" ON public.permit_workflow_overrides
  FOR SELECT TO authenticated
  USING (public.is_approver(auth.uid()));

CREATE POLICY "Approvers can insert overrides" ON public.permit_workflow_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approver(auth.uid()));

CREATE POLICY "Approvers can delete overrides" ON public.permit_workflow_overrides
  FOR DELETE TO authenticated
  USING (public.is_approver(auth.uid()));

-- Create table for workflow modification audit logs
CREATE TABLE public.permit_workflow_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  modified_by uuid NOT NULL REFERENCES auth.users(id),
  modified_by_name text NOT NULL,
  modified_by_email text NOT NULL,
  modification_type text NOT NULL,
  original_work_type_id uuid,
  new_work_type_id uuid,
  original_steps jsonb,
  new_steps jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- RLS policies for permit_workflow_audit
ALTER TABLE public.permit_workflow_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit" ON public.permit_workflow_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Approvers can view audit for permits" ON public.permit_workflow_audit
  FOR SELECT TO authenticated
  USING (public.is_approver(auth.uid()));

CREATE POLICY "System can insert audit" ON public.permit_workflow_audit
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Add columns to work_permits for tracking workflow customization
ALTER TABLE public.work_permits 
ADD COLUMN IF NOT EXISTS workflow_customized boolean DEFAULT false;

ALTER TABLE public.work_permits 
ADD COLUMN IF NOT EXISTS workflow_modified_by uuid REFERENCES auth.users(id);

ALTER TABLE public.work_permits 
ADD COLUMN IF NOT EXISTS workflow_modified_at timestamptz;