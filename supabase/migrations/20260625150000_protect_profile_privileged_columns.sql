-- =============================================================================
-- SECURITY FIX: department_id / actor_type must be admin-controlled
-- =============================================================================
-- The confidential comment tier is gated by
--   get_user_department(auth.uid()) = author_department_id
-- i.e. the caller's profiles.department_id. The pre-existing self-update policy
-- "Users can update own profile" (USING id = auth.uid(), no WITH CHECK / column
-- allowlist) let ANY authenticated non-tenant user PATCH their own
-- profiles.department_id to an arbitrary department (department ids are world-
-- readable), making get_user_department() return that department and exposing
-- another department's CONFIDENTIAL comments via the API. (Tenants were already
-- blocked by enforce_tenant_no_department.)
--
-- Fix: a BEFORE UPDATE trigger that, for any non-admin authenticated caller,
-- preserves the existing department_id and actor_type. Admins (and trusted
-- service-role / definer contexts where auth.uid() IS NULL) may still change
-- them. This is surgical: ordinary self-edits (full_name, phone, etc.) are
-- unaffected, and the existing UPDATE policies are left in place.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  -- auth.uid() IS NULL => service-role / definer context (trusted) -> allow.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.department_id := OLD.department_id;
    NEW.actor_type    := OLD.actor_type;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

COMMIT;

NOTIFY pgrst, 'reload schema';
