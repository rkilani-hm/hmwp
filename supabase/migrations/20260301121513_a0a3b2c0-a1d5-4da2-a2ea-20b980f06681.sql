
-- Update is_approver to include gate pass roles
CREATE OR REPLACE FUNCTION public.is_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.name IN (
        -- Client workflow roles
        'customer_service', 'cr_coordinator', 'head_cr', 'fmsp_approval',
        -- Internal workflow roles  
        'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 
        -- Facility and admin roles
        'soft_facilities', 'hard_facilities', 'pm_service', 'admin',
        'ecovert_supervisor', 'pmd_coordinator',
        -- Gate pass roles
        'store_manager', 'finance', 'security'
      )
  )
$$;
