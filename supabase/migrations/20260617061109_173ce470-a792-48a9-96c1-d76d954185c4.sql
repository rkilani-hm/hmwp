
-- 1. Drop the misconfigured storage policy that targeted `authenticated` instead of service_role
DROP POLICY IF EXISTS "Service role can upload permit PDFs" ON storage.objects;

-- 2. Pin search_path on the only public function missing it
CREATE OR REPLACE FUNCTION public.companies_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

-- 3. Revoke anonymous EXECUTE on SECURITY DEFINER functions that don't need to be public.
--    `get_public_permit_status` is the only one intentionally callable anonymously.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname <> 'get_public_permit_status'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END$$;
