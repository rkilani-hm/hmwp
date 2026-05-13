-- Enforce tenant vs. staff role separation
--
-- Two paths into the system, two different role outcomes:
--
--   1. Self-signup (tenant registration form on /auth):
--      - account_status = 'pending' until admin approves
--      - role = 'tenant' (assigned by trigger; the ONLY way to
--        become a tenant)
--
--   2. Admin-created (CreateUserDialog → admin-create-user
--      edge function):
--      - account_status = 'approved' immediately
--      - role(s) = whatever the admin selected (any role EXCEPT
--        'tenant', enforced by the edge function + the trigger)
--
-- Previous behavior (problem):
--   The trigger ALWAYS assigned 'tenant' to every new user, even
--   admin-created ones. The edge function then had to DELETE the
--   auto-assigned tenant role before adding the real ones. If
--   anything failed between trigger and cleanup, the admin user
--   ended up with the tenant role AS WELL AS their real role —
--   wrong, and a security concern (tenant has different RLS
--   visibility than staff).
--
-- New behavior:
--   - is_admin_created flag is checked
--   - tenant role is ONLY assigned when is_admin_created = false
--   - admin-created users get no default role; the edge function
--     adds them all explicitly
--
-- Idempotent. Pure function-replacement; no schema changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tenant_role_id uuid;
  initial_status text;
  v_phone text;
  v_company text;
  v_is_admin_created boolean;
BEGIN
  -- Admin-created flag is set by the admin-create-user edge
  -- function. Self-signups omit it (and land as pending tenants).
  v_is_admin_created := COALESCE(
    NEW.raw_user_meta_data->>'admin_created' = 'true',
    false
  );

  IF v_is_admin_created THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  v_phone   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
  v_company := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');

  INSERT INTO public.profiles (
    id, email, full_name, phone, company_name, account_status, account_approved_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_phone,
    v_company,
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  -- Only self-signups get the default tenant role.
  -- Admin-created users get their roles assigned explicitly by the
  -- admin-create-user edge function — and the edge function rejects
  -- 'tenant' in the role list as a server-side guard.
  IF NOT v_is_admin_created THEN
    SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;
    IF tenant_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, tenant_role_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Profile-and-role bootstrap trigger on auth.users INSERT. Self-' ||
  'signups land as pending tenants. Admin-created users (signaled ' ||
  'by raw_user_meta_data.admin_created=''true'') land as approved ' ||
  'with NO default role — the admin-create-user edge function ' ||
  'assigns their roles explicitly. Tenants can ONLY be created ' ||
  'via self-signup; admin users CANNOT be created with the tenant ' ||
  'role.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ---------------------------------------------------------------
-- Legacy data note (operational, not enforced)
-- ---------------------------------------------------------------
-- Existing admin-created users may have BOTH a tenant role AND
-- their real role(s) if the previous cleanup-after-insert logic
-- ever failed silently. To audit / clean:
--
--   SELECT p.email, array_agg(r.name) AS roles
--     FROM profiles p
--     JOIN user_roles ur ON ur.user_id = p.id
--     JOIN roles r ON r.id = ur.role_id
--    WHERE p.account_status = 'approved'
--    GROUP BY p.email
--   HAVING 'tenant' = ANY(array_agg(r.name))
--      AND array_length(array_agg(r.name), 1) > 1;
--
-- If any rows return, manually delete the tenant role for those
-- users via RolesManagement UI or:
--
--   DELETE FROM user_roles
--    WHERE role_id = (SELECT id FROM roles WHERE name = 'tenant')
--      AND user_id IN (<the offenders>);
