-- Restore EXECUTE on SECURITY DEFINER helper functions to the `authenticated` role.
--
-- Migration 20260617061109 revoked EXECUTE on every SECURITY DEFINER function in
-- `public` FROM PUBLIC, anon (to stop anonymous callers from invoking them
-- directly). But `authenticated` was relying on the default PUBLIC grant, so that
-- revoke silently stripped EXECUTE from logged-in users too. Any RLS policy or
-- query that calls a helper like has_role() or is_gate_pass_approver() as an
-- authenticated user then failed with "permission denied for function ...".
--
-- This grants EXECUTE back to `authenticated` on all SECURITY DEFINER functions
-- in `public` — the intended callers — without re-exposing them to anon.
-- get_public_permit_status keeps its PUBLIC grant (it is the one function meant
-- to be callable anonymously); granting authenticated on it as well is harmless.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END$$;
