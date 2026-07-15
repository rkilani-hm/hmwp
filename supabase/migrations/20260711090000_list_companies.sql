-- Add a new tenant to an EXISTING company.
--
-- Companies are auto-linked from profiles.company_name via the
-- sync_profile_company_id trigger (case-insensitive get-or-create). So inviting
-- a tenant with an existing company's exact name links them to the same company.
-- This RPC lets the admin UI list existing companies (with user counts) to pick
-- from — avoiding typos that would spawn a duplicate company.

CREATE OR REPLACE FUNCTION public.list_companies()
RETURNS TABLE(id uuid, name text, user_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.name, (SELECT count(*) FROM public.profiles p WHERE p.company_id = c.id)
  FROM public.companies c
  WHERE public.is_non_tenant_staff(auth.uid())
  ORDER BY c.name;
$$;
GRANT EXECUTE ON FUNCTION public.list_companies() TO authenticated;
