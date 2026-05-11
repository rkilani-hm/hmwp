
-- Workflow versioning: snapshot a workflow template's steps when published
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS published_by uuid;

CREATE TABLE IF NOT EXISTS public.workflow_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  workflow_type text NOT NULL,
  steps_snapshot jsonb NOT NULL,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  published_by uuid,
  notes text,
  UNIQUE (workflow_template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_wtv_template ON public.workflow_template_versions(workflow_template_id);

ALTER TABLE public.workflow_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage workflow_template_versions"
  ON public.workflow_template_versions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated view workflow_template_versions"
  ON public.workflow_template_versions FOR SELECT
  TO authenticated
  USING (true);
