-- Restore the minimum helper-function privileges required by authenticated RLS paths.
-- A prior hardening migration revoked EXECUTE broadly from SECURITY DEFINER
-- functions; these two helpers are intentionally used by authenticated policies
-- and application queries.

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.is_gate_pass_approver(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_gate_pass_approver(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_gate_pass_approver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_gate_pass_approver(uuid) TO service_role;