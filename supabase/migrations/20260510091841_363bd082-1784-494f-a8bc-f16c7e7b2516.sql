
-- 1. Safe public lookup function returning only non-sensitive fields
CREATE OR REPLACE FUNCTION public.get_public_permit_status(_permit_no text)
RETURNS TABLE (
  permit_no text,
  status permit_status,
  work_date_from date,
  work_date_to date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wp.permit_no, wp.status, wp.work_date_from, wp.work_date_to
  FROM public.work_permits wp
  WHERE wp.is_internal = true
    AND wp.requester_id IS NULL
    AND lower(wp.permit_no) = lower(_permit_no)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_permit_status(text) TO anon, authenticated;

-- 2. Drop the broad anonymous SELECT policy that exposed contact info
DROP POLICY IF EXISTS "Allow anonymous view by permit number" ON public.work_permits;

-- 3. Tighten permit_workflow_audit insert policy (was WITH CHECK true for anyone)
DROP POLICY IF EXISTS "System can insert audit" ON public.permit_workflow_audit;
CREATE POLICY "Authenticated can insert audit"
  ON public.permit_workflow_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Defensively require an authenticated session on profiles SELECT policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));
