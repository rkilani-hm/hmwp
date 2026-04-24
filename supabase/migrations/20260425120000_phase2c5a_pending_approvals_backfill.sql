-- ============================================================================
-- Phase 2c-5a: populate pending rows in permit_approvals
--
-- Until now, permit_approvals has only ever contained rows for approvals
-- that actually happened (approved / rejected). There are no 'pending'
-- rows for required roles that haven't acted yet. This makes the
-- permit_pending_approvals view useless (it returns empty for every
-- active permit) and blocks switching the inbox reader to the new table.
--
-- This migration:
--
--   1. Introduces `public.ensure_permit_pending_approvals(uuid)` — an
--      idempotent function that inserts missing 'pending' rows for a
--      given permit. It walks the workflow template's steps, applies the
--      same requirement-priority chain the frontend uses (overrides ->
--      work_type_step_config -> is_required_default -> requires_*
--      legacy fallback -> default true), and inserts a pending row for
--      any required step that has no row yet. Existing rows
--      (approved / rejected / already-pending) are left untouched.
--
--   2. Adds a trigger on work_permits that calls this function
--      AFTER INSERT so every new permit gets its pending rows at submit
--      time automatically.
--
--   3. Runs a one-shot backfill across all active permits (not archived,
--      not draft). This populates pending rows for the existing fleet.
--
-- Dual-write semantics: the existing dual-write helper in
-- _shared/approvals-dualwrite.ts uses INSERT ... ON CONFLICT DO UPDATE
-- keyed on (permit_id, role_name). When a pending row exists, the
-- upsert updates it in place to 'approved' or 'rejected' with the
-- approver data. When no pending row exists (shouldn't happen after
-- this migration, but safe for pre-Phase-2b historical records),
-- upsert inserts a fresh row. Nothing to change there.
--
-- Notes:
--  - Idempotent: safe to run multiple times. Repeat runs insert zero rows.
--  - Additive: no DROP, no column changes, no data loss paths.
--  - Deferred: until the inbox reader is switched (Phase 2c-5b), the
--    pending rows are informational only. Nothing queries them yet.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ensure_permit_pending_approvals(permit_id) -- idempotent pending-row insert
-- ----------------------------------------------------------------------------
-- Returns the number of rows inserted.
-- Marked SECURITY DEFINER so the trigger + backfill can insert rows without
-- running afoul of RLS. Explicitly does NOT mutate existing rows.
CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals(p_permit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_permit record;
  v_wf_template uuid;
BEGIN
  -- Load the permit and its work type.
  SELECT wp.id, wp.work_type_id, wp.status, wp.is_archived,
         wt.workflow_template_id
    INTO v_permit
    FROM public.work_permits wp
    LEFT JOIN public.work_types wt ON wt.id = wp.work_type_id
   WHERE wp.id = p_permit_id;

  -- Permit doesn't exist: nothing to do.
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Don't populate for archived permits — they're dead.
  IF COALESCE(v_permit.is_archived, false) THEN
    RETURN 0;
  END IF;

  -- Don't populate for draft permits — they haven't been submitted yet and
  -- the workflow hasn't started. When they transition to 'submitted', the
  -- trigger on work_permits (below) will re-call this function.
  IF v_permit.status = 'draft' OR v_permit.status IS NULL THEN
    RETURN 0;
  END IF;

  v_wf_template := v_permit.workflow_template_id;

  -- No workflow template: nothing to insert (rare edge case for legacy
  -- permits without a work type template).
  IF v_wf_template IS NULL THEN
    RETURN 0;
  END IF;

  -- Walk the workflow steps, compute requirement, insert if missing.
  --
  -- Priority chain (matches UnifiedWorkflowProgress + PermitApprovalProgress):
  --   1. permit_workflow_overrides.is_required
  --   2. work_type_step_config.is_required
  --   3. workflow_steps.is_required_default
  --   4. work_types.requires_<role_name>  (legacy fallback)
  --   5. default true
  WITH step_list AS (
    SELECT
      ws.id                 AS step_id,
      ws.role_id,
      r.name                AS role_name,
      ws.step_order,
      -- Resolve requirement using COALESCE across the priority chain
      COALESCE(
        pwo.is_required,                                                   -- 1
        wtsc.is_required,                                                  -- 2
        ws.is_required_default,                                            -- 3
        -- 4. legacy requires_<role_name> lookup via dynamic JSON probe
        (to_jsonb(wt.*) ->> ('requires_' || r.name))::boolean,
        true                                                               -- 5
      ) AS is_required
    FROM public.workflow_steps ws
    JOIN public.roles r ON r.id = ws.role_id
    LEFT JOIN public.permit_workflow_overrides pwo
      ON pwo.permit_id = p_permit_id AND pwo.workflow_step_id = ws.id
    LEFT JOIN public.work_type_step_config wtsc
      ON wtsc.work_type_id = v_permit.work_type_id
     AND wtsc.workflow_step_id = ws.id
    LEFT JOIN public.work_types wt ON wt.id = v_permit.work_type_id
    WHERE ws.workflow_template_id = v_wf_template
      AND r.name IS NOT NULL
  ),
  to_insert AS (
    INSERT INTO public.permit_approvals (
      permit_id, workflow_step_id, role_id, role_name, status
    )
    SELECT p_permit_id, sl.step_id, sl.role_id, sl.role_name, 'pending'
      FROM step_list sl
     WHERE sl.is_required = true
       AND NOT EXISTS (
         SELECT 1 FROM public.permit_approvals pa
          WHERE pa.permit_id = p_permit_id
            AND pa.role_name = sl.role_name
       )
    ON CONFLICT (permit_id, role_name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM to_insert;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.ensure_permit_pending_approvals(uuid) IS
  'Phase 2c-5a: idempotently inserts pending permit_approvals rows for every '
  'required workflow step that does not yet have a row. Applies the same '
  'requirement-priority chain the frontend uses (overrides -> work_type_step_config '
  '-> is_required_default -> requires_<role> legacy fallback -> true).';


-- ----------------------------------------------------------------------------
-- Trigger: call ensure_permit_pending_approvals on new permits
-- ----------------------------------------------------------------------------
-- Fires AFTER INSERT (so the permit row is visible to the function) and
-- AFTER UPDATE OF status (so a draft->submitted transition also triggers).
-- Reminder: ensure_permit_pending_approvals() bails out early on drafts,
-- so the insert-time trigger on an unsubmitted permit is a no-op.

CREATE OR REPLACE FUNCTION public._trg_permit_ensure_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_permit_pending_approvals(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_permits_ensure_pending ON public.work_permits;
CREATE TRIGGER work_permits_ensure_pending
  AFTER INSERT OR UPDATE OF status ON public.work_permits
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM 'draft' AND NEW.status IS NOT NULL)
  EXECUTE FUNCTION public._trg_permit_ensure_pending();


-- ----------------------------------------------------------------------------
-- Backfill: run ensure function across all active permits
-- ----------------------------------------------------------------------------
-- Applies to: not archived, not draft, status is not null. That covers
-- everything the inbox might want to surface, including fully approved
-- permits (for which the function is a no-op since all roles already
-- have rows). Fully approved permits are still fine to process — they
-- have zero required-but-missing rows, so the function inserts zero.
DO $$
DECLARE
  v_permit_id uuid;
  v_total integer := 0;
  v_inserted_total integer := 0;
  v_this integer;
BEGIN
  FOR v_permit_id IN
    SELECT id FROM public.work_permits
     WHERE NOT COALESCE(is_archived, false)
       AND status IS NOT NULL
       AND status <> 'draft'
  LOOP
    v_total := v_total + 1;
    v_this := public.ensure_permit_pending_approvals(v_permit_id);
    v_inserted_total := v_inserted_total + v_this;
  END LOOP;

  RAISE NOTICE 'Phase 2c-5a backfill: processed % permits, inserted % pending rows',
    v_total, v_inserted_total;
END $$;

COMMIT;
