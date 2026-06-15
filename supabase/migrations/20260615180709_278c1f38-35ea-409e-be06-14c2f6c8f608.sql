-- Helper: true if the user has the 'tenant' role
CREATE OR REPLACE FUNCTION public.is_tenant_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.name = 'tenant'
  )
$$;

-- work_permits: tenants only see their own permits (no company sharing)
DROP POLICY IF EXISTS "Users can view own or company permits" ON public.work_permits;
CREATE POLICY "Users can view own or company permits"
ON public.work_permits
FOR SELECT
TO authenticated
USING (
  requester_id = auth.uid()
  OR (
    NOT public.is_tenant_user(auth.uid())
    AND public.same_company(auth.uid(), requester_id)
  )
);

-- gate_passes: same tenant isolation
DROP POLICY IF EXISTS "Users can view own or company gate passes" ON public.gate_passes;
CREATE POLICY "Users can view own or company gate passes"
ON public.gate_passes
FOR SELECT
TO authenticated
USING (
  requester_id = auth.uid()
  OR (
    NOT public.is_tenant_user(auth.uid())
    AND public.same_company(auth.uid(), requester_id)
  )
);