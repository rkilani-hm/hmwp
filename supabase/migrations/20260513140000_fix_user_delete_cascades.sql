-- Fix user-delete cascades
--
-- Three foreign keys to auth.users(id) were created without an
-- ON DELETE clause, so they default to NO ACTION (blocks delete).
-- Whenever an admin tries to delete a user who has ever modified a
-- workflow on a permit, Postgres refuses the auth.users delete and
-- the admin-delete-user edge function returns 500. The UI then shows
-- the generic "The server encountered an issue..." fallback.
--
-- The three blockers:
--
--   1. permit_workflow_overrides.created_by — nullable, blocks if
--      the user ever added a workflow override on any permit.
--   2. permit_workflow_audit.modified_by — NOT NULL, blocks
--      permanently once an audit row exists. modified_by_name and
--      modified_by_email are also NOT NULL on the same row, so
--      losing the live FK doesn't lose the human-readable record.
--   3. work_permits.workflow_modified_by — nullable, blocks if the
--      user ever customized a permit's workflow.
--
-- Fix: switch all three to ON DELETE SET NULL. For permit_workflow_
-- audit.modified_by we also drop the NOT NULL constraint so SET NULL
-- can succeed; the textual columns (modified_by_name, modified_by_email)
-- preserve who did what.
--
-- Idempotent: each ALTER uses IF EXISTS / OR REPLACE patterns where
-- possible. Drops + recreates each FK so re-running is safe.
--
-- No data is modified — only constraints.

BEGIN;

-- ---------------------------------------------------------------
-- 1. permit_workflow_overrides.created_by
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'permit_workflow_overrides_created_by_fkey'
      AND conrelid = 'public.permit_workflow_overrides'::regclass
  ) THEN
    ALTER TABLE public.permit_workflow_overrides
      DROP CONSTRAINT permit_workflow_overrides_created_by_fkey;
  END IF;
END $$;

ALTER TABLE public.permit_workflow_overrides
  ADD CONSTRAINT permit_workflow_overrides_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 2. permit_workflow_audit.modified_by
--    Drop NOT NULL, then drop+recreate FK with ON DELETE SET NULL
-- ---------------------------------------------------------------
ALTER TABLE public.permit_workflow_audit
  ALTER COLUMN modified_by DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'permit_workflow_audit_modified_by_fkey'
      AND conrelid = 'public.permit_workflow_audit'::regclass
  ) THEN
    ALTER TABLE public.permit_workflow_audit
      DROP CONSTRAINT permit_workflow_audit_modified_by_fkey;
  END IF;
END $$;

ALTER TABLE public.permit_workflow_audit
  ADD CONSTRAINT permit_workflow_audit_modified_by_fkey
  FOREIGN KEY (modified_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.permit_workflow_audit.modified_by IS
  'Live FK to auth.users(id); set NULL when actor account is deleted. ' ||
  'modified_by_name and modified_by_email preserve the human-readable ' ||
  'identity for audit purposes regardless of FK state.';

-- ---------------------------------------------------------------
-- 3. work_permits.workflow_modified_by
-- ---------------------------------------------------------------
DO $$
DECLARE
  fk_name text;
BEGIN
  -- The constraint name wasn't pinned in the original migration; look it up.
  SELECT conname INTO fk_name
    FROM pg_constraint
   WHERE conrelid = 'public.work_permits'::regclass
     AND pg_get_constraintdef(oid) LIKE '%(workflow_modified_by)%REFERENCES auth.users%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.work_permits DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.work_permits
  ADD CONSTRAINT work_permits_workflow_modified_by_fkey
  FOREIGN KEY (workflow_modified_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- PostgREST schema reload
-- ---------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
