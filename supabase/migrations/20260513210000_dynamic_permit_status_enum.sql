-- Dynamic permit_status enum for custom roles
--
-- ## The bug
--
-- getFirstWorkflowStep() in useWorkPermits.ts derives the permit status
-- as `pending_${role.name}` (a string concatenation). But permit_status
-- is a hardcoded Postgres enum. When an admin creates a custom role
-- through RolesManagement (e.g. 'al_hamra_customer_service'), nothing
-- adds the matching 'pending_al_hamra_customer_service' enum value, so
-- the first permit routed through that role fails with:
--
--   invalid input value for enum permit_status:
--     "pending_al_hamra_customer_service"
--
-- This happened repeatedly historically — see the cluster of migrations
-- around 2026-01 / 2026-02 that each added a single value for a single
-- newly-introduced role. Every custom role today has this latent bug.
--
-- ## The fix
--
-- Three parts, all idempotent:
--
--   1. Backfill — sweep every row in public.roles, add the matching
--      pending_<name> value to permit_status if it's not already there.
--      Catches every existing custom role at once.
--
--   2. Helper function ensure_pending_status_for_role(role_name) that
--      handles the ALTER TYPE safely from any caller (trigger,
--      manual SQL, future code paths). Wraps in EXCEPTION block so
--      malformed names don't roll back the calling transaction.
--
--   3. Trigger on AFTER INSERT INTO roles that calls the helper. From
--      this migration forward, creating a role automatically extends
--      the enum — never bites anyone again.
--
-- ## Postgres version note
--
-- ALTER TYPE ... ADD VALUE inside a transaction is supported on
-- Postgres 12+. The only restriction is you cannot USE the new value
-- in the same transaction. Our trigger fires on INSERT INTO roles —
-- the matching pending_<name> value isn't used until LATER (when a
-- permit is routed through that role), so the in-transaction
-- limitation doesn't bite us.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Helper function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_pending_status_for_role(role_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  enum_value text;
BEGIN
  IF role_name IS NULL OR TRIM(role_name) = '' THEN
    RETURN;
  END IF;

  enum_value := 'pending_' || role_name;

  -- ALTER TYPE ADD VALUE IF NOT EXISTS is a one-shot DDL; wrap in
  -- EXCEPTION so malformed role names (with quotes, etc.) don't
  -- propagate up into the calling transaction.
  BEGIN
    EXECUTE format(
      'ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS %L',
      enum_value
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ensure_pending_status_for_role(%) failed: %',
      role_name, SQLERRM;
  END;
END;
$$;

COMMENT ON FUNCTION public.ensure_pending_status_for_role(text) IS
  'Adds a pending_<role_name> value to permit_status enum if absent. ' ||
  'Called by the AFTER INSERT trigger on public.roles. Idempotent.';

-- ---------------------------------------------------------------
-- 2. Backfill: sweep every existing role
-- ---------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT name FROM public.roles LOOP
    PERFORM public.ensure_pending_status_for_role(r.name);
  END LOOP;
END $$;

COMMIT;

-- The trigger creation needs to come AFTER the commit above —
-- because the trigger references the function and we want both
-- helper + backfill committed before exposing the trigger.

BEGIN;

-- ---------------------------------------------------------------
-- 3. Trigger: auto-extend enum on role creation
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_roles_add_status_enum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_pending_status_for_role(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_add_status_enum_trigger ON public.roles;
CREATE TRIGGER roles_add_status_enum_trigger
  AFTER INSERT ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_roles_add_status_enum();

-- Also fire on UPDATE when name changes — admins can rename roles
-- in RolesManagement; the new name needs an enum value too. The
-- old name's enum value is left behind (can't drop enum values
-- in Postgres without recreating the type), which is fine — it
-- just becomes an unused enum value.
CREATE OR REPLACE FUNCTION public.tr_roles_rename_status_enum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.ensure_pending_status_for_role(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_rename_status_enum_trigger ON public.roles;
CREATE TRIGGER roles_rename_status_enum_trigger
  AFTER UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_roles_rename_status_enum();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ---------------------------------------------------------------
-- Diagnostic: list any pending_X values that exist in the enum
-- but have NO matching role. These are harmless (just unused enum
-- members) but useful to identify roles that have been deleted.
-- Run manually if curious:
--
--   SELECT unnest(enum_range(NULL::permit_status))::text AS enum_val
--    EXCEPT
--   SELECT 'pending_' || name FROM public.roles
--    UNION
--   SELECT unnest(ARRAY[
--     'draft','submitted','under_review','rework_needed',
--     'approved','rejected','closed','cancelled','superseded'
--   ]);
-- ---------------------------------------------------------------
