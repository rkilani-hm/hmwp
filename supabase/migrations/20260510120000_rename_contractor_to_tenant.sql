-- Rename the "contractor" role to "tenant"
--
-- Background: the `contractor` role was the system's default for permit
-- requesters, but in Al Hamra's domain a tenant (lessee of a unit) is the
-- party who submits permits and gate-pass requests. The contractor doing
-- the physical work is often a different party. This migration renames
-- the role end-to-end so naming matches the business model.
--
-- Scope:
--   1. Rename the enum value `app_role.'contractor'` → `'tenant'`
--      (in-place; PostgreSQL 10+ supports this without rewriting tables).
--   2. Update the corresponding row in `public.roles`.
--   3. Re-create `handle_new_user()` to assign the renamed role.
--
-- What this migration does NOT touch:
--   * Schema columns named `contractor_name`, `client_contractor_name`,
--     `external_company_name` — these describe the contractor doing the
--     physical work, which is a separate concept from the system user role.
--   * UI labels for "Contractor Info" form sections that capture data
--     about the work contractor.
--   * Existing user_roles rows referencing the role — the enum-value
--     rename and the UPDATE on `roles.name` propagate automatically; rows
--     in `user_roles` keep their `role_id` foreign key intact.
--
-- Idempotent: each step uses guards so re-running does nothing.

-- Step 1: rename the enum value if it still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role'
      AND e.enumlabel = 'contractor'
  ) THEN
    EXECUTE $rename$ALTER TYPE public.app_role RENAME VALUE 'contractor' TO 'tenant'$rename$;
  END IF;
END $$;

-- Step 2: update the roles table row.
UPDATE public.roles
SET
  name        = 'tenant',
  label       = 'Tenant',
  description = 'Default role for tenants who submit work permits and gate pass requests'
WHERE name = 'contractor';

-- Step 3: re-create handle_new_user() to look up the renamed role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tenant_role_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );

  -- Get the tenant role id (was 'contractor' before this migration).
  SELECT id INTO tenant_role_id
  FROM public.roles
  WHERE name = 'tenant'
  LIMIT 1;

  -- Default role is tenant.
  IF tenant_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, tenant_role_id);
  END IF;

  RETURN NEW;
END;
$$;
