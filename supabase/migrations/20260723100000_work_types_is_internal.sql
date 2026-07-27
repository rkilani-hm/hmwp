-- Expose whether a work type is INTERNAL (Al Hamra staff) or CLIENT (tenant),
-- so the New Request wizard can offer the right list per requester scope.
--
-- The authoritative source is already workflow_templates.workflow_type, read via
-- the existing work_type_is_internal() helper — deliberately NOT duplicated as a
-- column on work_types, which would drift when a work type is renamed or a
-- workflow's type changes.
--
-- Mirrors list_work_types_for_caller()'s tenant gate (tenant-only users never
-- receive internal work types) and adds the flag to the result.

CREATE OR REPLACE FUNCTION public.list_work_types_with_scope()
RETURNS TABLE(id uuid, name text, is_internal boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wt.id, wt.name, public.work_type_is_internal(wt.id)
  FROM public.work_types wt
  WHERE NOT (public.is_tenant_only(auth.uid()) AND public.work_type_is_internal(wt.id))
  ORDER BY wt.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_work_types_with_scope() TO authenticated;
