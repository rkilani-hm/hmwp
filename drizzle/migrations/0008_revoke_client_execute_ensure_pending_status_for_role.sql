REVOKE EXECUTE ON FUNCTION public.ensure_pending_status_for_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_pending_status_for_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_pending_status_for_role(text) FROM authenticated;