-- =============================================================================
-- Tenants are never assigned to a department
--   follow-up to specs/departments-and-reviewer-flag.md
-- =============================================================================
-- Departments are an INTERNAL-staff concept. A user holding the 'tenant' role
-- must never carry a department_id. The admin UI already hides the selector for
-- tenants; this trigger enforces it at the DB level (defense in depth) so a
-- tenant can never be assigned a department by any path.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_tenant_no_department()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.department_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
         JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = NEW.id AND r.name = 'tenant'
     )
  THEN
    NEW.department_id := NULL;  -- silently clear; tenants get no department
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_no_department ON public.profiles;
CREATE TRIGGER trg_enforce_tenant_no_department
  BEFORE INSERT OR UPDATE OF department_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_no_department();

-- Clean up any tenant that somehow already has a department.
UPDATE public.profiles p
   SET department_id = NULL
 WHERE p.department_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p.id AND r.name = 'tenant'
   );

COMMIT;
