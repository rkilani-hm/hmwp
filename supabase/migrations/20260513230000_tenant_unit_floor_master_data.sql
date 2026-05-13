-- Tenant master data: unit + floor
--
-- Tenants now provide their building unit and floor at signup, alongside
-- name / phone / company. These get stored on the profile so every
-- subsequent form (work-permit wizard, gate-pass wizard, etc.) can pre-
-- fill them instead of forcing the tenant to retype the same data on
-- every request.
--
-- ## What changes
--
--   1. Add nullable text columns `unit` and `floor` to public.profiles
--   2. Update handle_new_user() trigger to read these from
--      raw_user_meta_data at signup time, the same way it currently
--      reads phone + company_name
--   3. No backfill needed — existing profiles get NULL, which is fine
--      (tenants can still type the values in the wizard like today;
--      admins can fill them in via the new admin edit dialog)
--
-- ## Why nullable
--
-- Tenants who registered before this migration won't have a value.
-- Forcing NOT NULL would require a backfill or break existing logins.
-- Wizard inputs treat null and empty string identically.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Add the columns
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS floor text;

COMMENT ON COLUMN public.profiles.unit  IS
  'Tenant''s building unit number, captured at signup. Used to pre-fill '
  'the work-permit + gate-pass wizards. Free-text; no validation.';
COMMENT ON COLUMN public.profiles.floor IS
  'Tenant''s building floor, captured at signup. Used to pre-fill the '
  'work-permit + gate-pass wizards. Free-text; no validation.';

-- ---------------------------------------------------------------
-- 2. Update handle_new_user() to consume unit + floor from metadata
-- ---------------------------------------------------------------
--
-- The function is rewritten in full (CREATE OR REPLACE), reproducing
-- the logic from the most-recent prior version
-- (20260513180000_enforce_tenant_vs_staff_roles.sql) and adding the
-- new fields. Anything depending on the function name continues to
-- work — only the body changes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  initial_status     text;
  v_phone            text;
  v_company          text;
  v_unit             text;
  v_floor            text;
  tenant_role_id     uuid;
  signup_source      text;
BEGIN
  -- Self-signup vs admin-created: the admin-create-user edge function
  -- sets raw_user_meta_data.signup_source = 'admin_created'. Anything
  -- else (or null) is treated as a self-signup and goes through the
  -- pending-approval flow.
  signup_source := NEW.raw_user_meta_data->>'signup_source';
  IF signup_source = 'admin_created' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  -- Trim and null-out empty strings — keeps the profile clean and
  -- avoids ugly '— ' display in admin lists for users who left a
  -- field blank.
  v_phone   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone',        '')), '');
  v_company := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');
  v_unit    := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'unit',         '')), '');
  v_floor   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'floor',        '')), '');

  INSERT INTO public.profiles (
    id, email, full_name, phone, company_name, unit, floor,
    account_status, account_approved_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_phone,
    v_company,
    v_unit,
    v_floor,
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  -- Only self-signups get the default tenant role. Admin-created
  -- users get their roles assigned explicitly by the admin-create-user
  -- edge function — it rejects any signup_source != 'admin_created'
  -- that somehow asks for a non-tenant role.
  IF signup_source <> 'admin_created' THEN
    SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;
    IF tenant_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, tenant_role_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
