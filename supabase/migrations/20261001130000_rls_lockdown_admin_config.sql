-- =============================================================================
-- Security: restrict sensitive config/permission tables to admins
--
-- Finding: any signed-in user could SELECT all rows of permissions,
-- role_permissions, sla_settings, sla_policies, sla_holidays, and
-- sharepoint_settings (SELECT policy with qual = true).
--
-- Fix:
--  - permissions / role_permissions: drop the table-wide SELECT. The app reads
--    ONLY the caller's own permission names via get_my_permissions() (SECURITY
--    DEFINER). Admins still read the full tables via the existing
--    "Admins can manage ..." ALL policies (PermissionsManagement screen).
--  - sla_settings / sla_policies / sla_holidays / sharepoint_settings: SELECT
--    restricted to admins (only admin screens read them client-side; backend
--    edge functions / triggers use the service role and bypass RLS).
--
-- Already applied to the live DB; this file keeps source in sync. Idempotent.
-- =============================================================================

-- Caller's effective permission names (own roles only) — no table-wide SELECT.
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT p.name
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
  JOIN public.user_roles ur ON ur.role_id = rp.role_id
  WHERE ur.user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- permissions / role_permissions: remove table-wide SELECT (admins keep the ALL policy).
DROP POLICY IF EXISTS "Authenticated users can view permissions" ON public.permissions;
DROP POLICY IF EXISTS "Authenticated users can view role_permissions" ON public.role_permissions;

-- sla_* + sharepoint_settings: SELECT = admins only.
DROP POLICY IF EXISTS "sla_settings_read" ON public.sla_settings;
CREATE POLICY "sla_settings_read" ON public.sla_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "sla_policies_read" ON public.sla_policies;
CREATE POLICY "sla_policies_read" ON public.sla_policies FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "sla_holidays_read" ON public.sla_holidays;
CREATE POLICY "sla_holidays_read" ON public.sla_holidays FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "sp_settings_read" ON public.sharepoint_settings;
CREATE POLICY "sp_settings_read" ON public.sharepoint_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
