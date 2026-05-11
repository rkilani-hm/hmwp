-- Phase 1: Workflow versioning
--
-- Today, an admin editing a workflow_template (adding/removing/reordering
-- workflow_steps) silently changes the approval path of permits ALREADY
-- IN FLIGHT. There's no defendable record of "this permit was approved
-- under version 3 of the template; admin later changed it to v4."
--
-- This migration:
--
--   1. Adds workflow_templates.version int (default 1)
--   2. Adds template_version int to permit_approvals and
--      gate_pass_approvals (nullable; backfilled to 1 for existing rows)
--   3. Trigger on workflow_steps INSERT/UPDATE/DELETE that bumps the
--      parent workflow_templates.version by 1
--   4. Trigger on workflow_templates UPDATE that bumps the version
--      when name/description-only changes happen (no — actually we
--      only bump when steps change, since template-meta edits don't
--      affect the approval path)
--   5. Updates ensure_permit_pending_approvals() to stamp the
--      current template version onto each pending row at insert time
--
-- Idempotent: all ALTER TABLE use IF NOT EXISTS; CREATE OR REPLACE
-- on functions; CREATE TRIGGER IF NOT EXISTS pattern.
--
-- Read semantics: nothing reads template_version yet — this PR is the
-- write-side. A follow-up PR can use template_version to: (a) display
-- on permit detail page "approved under workflow v3", (b) show
-- workflow_templates page "current version 5 — N permits in flight on
-- earlier versions", (c) restrict workflow edits to roles that
-- understand the implications.

BEGIN;

-- ---------------------------------------------------------------
-- 1. workflow_templates.version
-- ---------------------------------------------------------------
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.workflow_templates.version IS
  'Auto-incremented on every workflow_steps INSERT/UPDATE/DELETE. ' ||
  'permit_approvals.template_version snapshots this at permit creation ' ||
  'so historical decisions remain defendable even after template edits.';

-- ---------------------------------------------------------------
-- 2. template_version on approval tables
-- ---------------------------------------------------------------
ALTER TABLE public.permit_approvals
  ADD COLUMN IF NOT EXISTS template_version int;

ALTER TABLE public.gate_pass_approvals
  ADD COLUMN IF NOT EXISTS template_version int;

-- Backfill existing rows to version 1 (the implicit pre-versioning baseline)
UPDATE public.permit_approvals SET template_version = 1
  WHERE template_version IS NULL;
UPDATE public.gate_pass_approvals SET template_version = 1
  WHERE template_version IS NULL;

-- ---------------------------------------------------------------
-- 3. Trigger: bump workflow_templates.version when steps change
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_workflow_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_template_id uuid;
BEGIN
  -- On DELETE we use OLD; on INSERT/UPDATE we use NEW.
  IF TG_OP = 'DELETE' THEN
    target_template_id := OLD.workflow_template_id;
  ELSE
    target_template_id := NEW.workflow_template_id;
  END IF;

  IF target_template_id IS NOT NULL THEN
    UPDATE public.workflow_templates
       SET version    = version + 1,
           updated_at = now()
     WHERE id = target_template_id;
  END IF;

  -- Trigger return: NEW for INSERT/UPDATE, OLD for DELETE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop-and-recreate so re-running this migration is safe.
DROP TRIGGER IF EXISTS bump_workflow_version_on_step_change ON public.workflow_steps;

CREATE TRIGGER bump_workflow_version_on_step_change
  AFTER INSERT OR UPDATE OR DELETE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_workflow_template_version();

-- ---------------------------------------------------------------
-- 4. ensure_permit_pending_approvals: stamp template_version
-- ---------------------------------------------------------------
-- We extend the existing function (defined in
-- 20260425120000_phase2c5a_pending_approvals_backfill.sql) to also
-- write the template's CURRENT version onto each pending row. Existing
-- behaviour (deciding which steps to insert) is untouched.
--
-- Strategy: rather than reproduce the whole function here and risk
-- drift, do the version stamp as a follow-up UPDATE. After the
-- function returns, any rows still at template_version IS NULL on
-- this permit get stamped from their workflow_step's template version.
-- This works whether the original function changes or not.

CREATE OR REPLACE FUNCTION public.stamp_permit_approvals_template_version(p_permit_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.permit_approvals pa
     SET template_version = wt.version
    FROM public.workflow_steps ws
    JOIN public.workflow_templates wt ON wt.id = ws.workflow_template_id
   WHERE pa.permit_id = p_permit_id
     AND pa.template_version IS NULL
     AND pa.workflow_step_id = ws.id;
$$;

-- Run the stamping after pending-rows-creation by adding a trigger on
-- permit_approvals INSERT itself. Fires per row but only stamps when
-- template_version is NULL, so existing-row updates are no-ops.
CREATE OR REPLACE FUNCTION public.stamp_template_version_on_approval_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.template_version IS NULL AND NEW.workflow_step_id IS NOT NULL THEN
    SELECT wt.version INTO NEW.template_version
      FROM public.workflow_steps ws
      JOIN public.workflow_templates wt ON wt.id = ws.workflow_template_id
     WHERE ws.id = NEW.workflow_step_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_template_version_permit_approval ON public.permit_approvals;
CREATE TRIGGER stamp_template_version_permit_approval
  BEFORE INSERT ON public.permit_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_template_version_on_approval_row();

-- Same logic for gate_pass_approvals
CREATE OR REPLACE FUNCTION public.stamp_template_version_on_gate_pass_approval_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.template_version IS NULL AND NEW.workflow_step_id IS NOT NULL THEN
    SELECT wt.version INTO NEW.template_version
      FROM public.workflow_steps ws
      JOIN public.workflow_templates wt ON wt.id = ws.workflow_template_id
     WHERE ws.id = NEW.workflow_step_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_template_version_gate_pass_approval ON public.gate_pass_approvals;
CREATE TRIGGER stamp_template_version_gate_pass_approval
  BEFORE INSERT ON public.gate_pass_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_template_version_on_gate_pass_approval_row();

-- ---------------------------------------------------------------
-- 5. PostgREST schema reload
-- ---------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
