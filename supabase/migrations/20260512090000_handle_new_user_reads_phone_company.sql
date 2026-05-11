-- Extend handle_new_user() to write phone and company_name on signup.
--
-- The tenant signup form now collects Phone/Mobile and Company Name
-- alongside Full Name. supabase.auth.signUp() forwards these to the
-- trigger via raw_user_meta_data. The previous version only read
-- full_name; this version also reads phone and company_name and
-- inserts them into profiles.
--
-- The companies-table sync trigger (PR #26's
-- profiles_sync_company_id, BEFORE INSERT OR UPDATE OF company_name)
-- fires automatically on the INSERT below, so company_id is
-- populated as a side effect — no extra wiring needed here.
--
-- Idempotent: this is a CREATE OR REPLACE FUNCTION. Re-running has
-- no side effect on a healthy database.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tenant_role_id uuid;
  initial_status text;
BEGIN
  -- Admin-created users are pre-approved; self-signups are pending.
  IF NEW.raw_user_meta_data->>'admin_created' = 'true' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    company_name,
    account_status,
    account_approved_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    -- phone and company_name: NULL when missing rather than empty
    -- string, so admin-created accounts (which don't send these
    -- yet) don't get blank-string profiles that pass NOT NULL but
    -- fail later validations.
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'company_name', ''),
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  -- Assign the tenant role (formerly 'contractor', renamed in PR #21).
  SELECT id INTO tenant_role_id
  FROM public.roles
  WHERE name = 'tenant'
  LIMIT 1;

  IF tenant_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, tenant_role_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Reload PostgREST so the schema cache picks up any related changes.
-- (No public-facing API change in this migration, but it costs
-- nothing and keeps the cache fresh.)
NOTIFY pgrst, 'reload schema';
