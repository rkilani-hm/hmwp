-- Fix PUBLIC_DATA_EXPOSURE: Restrict RBAC metadata to authenticated users only

-- roles table: Change from public to authenticated-only access
DROP POLICY IF EXISTS "Anyone can view active roles" ON public.roles;
CREATE POLICY "Authenticated users can view active roles" 
ON public.roles FOR SELECT TO authenticated 
USING (is_active = true);

-- permissions table: Change from public to authenticated-only access
DROP POLICY IF EXISTS "Anyone can view permissions" ON public.permissions;
CREATE POLICY "Authenticated users can view permissions" 
ON public.permissions FOR SELECT TO authenticated 
USING (true);

-- role_permissions table: Change from public to authenticated-only access
DROP POLICY IF EXISTS "Anyone can view role_permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can view role_permissions" 
ON public.role_permissions FOR SELECT TO authenticated 
USING (true);