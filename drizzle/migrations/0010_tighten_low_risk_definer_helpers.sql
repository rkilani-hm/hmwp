REVOKE EXECUTE ON FUNCTION public.resolve_user_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_email(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.list_companies() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contractor_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contractor_tenants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_companies() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contractor_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contractor_tenants(uuid) TO authenticated, service_role;