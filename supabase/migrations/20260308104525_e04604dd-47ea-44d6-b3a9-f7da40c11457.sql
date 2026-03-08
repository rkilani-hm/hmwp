
CREATE OR REPLACE FUNCTION public.is_gate_pass_approver(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.name IN ('store_manager', 'finance', 'security', 'security_pmd', 'admin')
  )
$$;
