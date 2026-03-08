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
      AND (
        -- Admin always has access
        r.name = 'admin'
        -- Any role that is part of a gate_pass workflow template
        OR r.id IN (
          SELECT ws.role_id
          FROM public.workflow_steps ws
          JOIN public.workflow_templates wt ON wt.id = ws.workflow_template_id
          WHERE wt.workflow_type = 'gate_pass' AND wt.is_active = true
        )
        -- Legacy hardcoded roles as fallback
        OR r.name IN ('store_manager', 'finance', 'security', 'security_pmd')
      )
  )
$$;