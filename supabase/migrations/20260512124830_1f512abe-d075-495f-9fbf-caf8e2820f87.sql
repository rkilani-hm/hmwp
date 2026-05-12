BEGIN;

-- 1. permit_workflow_overrides.created_by
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

-- 2. permit_workflow_audit.modified_by
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

-- 3. work_permits.workflow_modified_by
DO $$
DECLARE
  fk_name text;
BEGIN
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

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Grant usage on auth schema to public for FK references
GRANT USAGE ON SCHEMA auth TO PUBLIC;

-- Refresh materialized views if any exist
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT matviewname
    FROM pg_matviews
    WHERE schemaname = 'public'
  LOOP
    EXECUTE 'REFRESH MATERIALIZED VIEW public.' || r.matviewname;
  END LOOP;
END $$;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
