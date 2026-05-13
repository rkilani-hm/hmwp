
BEGIN;

-- Helper function
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

-- Backfill all existing roles
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT name FROM public.roles LOOP
    PERFORM public.ensure_pending_status_for_role(r.name);
  END LOOP;
END $$;

COMMIT;

BEGIN;

-- Trigger: AFTER INSERT on roles
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

-- Trigger: AFTER UPDATE on roles (rename)
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

COMMIT;
