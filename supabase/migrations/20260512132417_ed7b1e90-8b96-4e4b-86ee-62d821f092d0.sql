-- feat/workflow-versioning
-- Auto-bump workflow_templates.version on any change to its steps,
-- and stamp the version onto each approval row at insert time so
-- in-flight permits keep their original workflow snapshot.

-- 1. Ensure workflow_templates.version exists (already exists with default 1; no-op safe)
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2. Trigger function: bump parent template version on any workflow_steps change
CREATE OR REPLACE FUNCTION public.bump_workflow_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _template_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _template_id := OLD.workflow_template_id;
  ELSE
    _template_id := NEW.workflow_template_id;
  END IF;

  IF _template_id IS NOT NULL THEN
    UPDATE public.workflow_templates
       SET version = COALESCE(version, 1) + 1,
           updated_at = now()
     WHERE id = _template_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_steps_bump_version ON public.workflow_steps;
CREATE TRIGGER trg_workflow_steps_bump_version
AFTER INSERT OR UPDATE OR DELETE ON public.workflow_steps
FOR EACH ROW EXECUTE FUNCTION public.bump_workflow_template_version();

-- 3. Stamp template version on approval rows
ALTER TABLE public.permit_approvals
  ADD COLUMN IF NOT EXISTS template_version integer;

ALTER TABLE public.gate_pass_approvals
  ADD COLUMN IF NOT EXISTS template_version integer;

-- 4. BEFORE INSERT trigger: resolve current template version from workflow_step_id
CREATE OR REPLACE FUNCTION public.stamp_approval_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v integer;
BEGIN
  IF NEW.template_version IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.workflow_step_id IS NOT NULL THEN
    SELECT wt.version INTO _v
      FROM public.workflow_steps ws
      JOIN public.workflow_templates wt ON wt.id = ws.workflow_template_id
     WHERE ws.id = NEW.workflow_step_id
     LIMIT 1;
  END IF;

  NEW.template_version := COALESCE(_v, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permit_approvals_stamp_version ON public.permit_approvals;
CREATE TRIGGER trg_permit_approvals_stamp_version
BEFORE INSERT ON public.permit_approvals
FOR EACH ROW EXECUTE FUNCTION public.stamp_approval_template_version();

DROP TRIGGER IF EXISTS trg_gate_pass_approvals_stamp_version ON public.gate_pass_approvals;
CREATE TRIGGER trg_gate_pass_approvals_stamp_version
BEFORE INSERT ON public.gate_pass_approvals
FOR EACH ROW EXECUTE FUNCTION public.stamp_approval_template_version();

-- 5. Backfill existing approval rows to version 1
UPDATE public.permit_approvals SET template_version = 1 WHERE template_version IS NULL;
UPDATE public.gate_pass_approvals SET template_version = 1 WHERE template_version IS NULL;