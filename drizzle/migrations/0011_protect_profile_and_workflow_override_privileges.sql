CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.department_id := OLD.department_id;
    NEW.actor_type := OLD.actor_type;
    NEW.account_status := OLD.account_status;
    NEW.is_active := OLD.is_active;
    NEW.is_vip := OLD.is_vip;
    NEW.company_name := OLD.company_name;
    NEW.company_id := OLD.company_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE trimmed text; resolved_id uuid;
BEGIN
  -- This trigger runs before the profile protection trigger alphabetically.
  -- Stop non-admin UPDATE resolution before it can create/reassign a company.
  IF TG_OP = 'UPDATE'
     AND auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.company_name := OLD.company_name;
    NEW.company_id := OLD.company_id;
    RETURN NEW;
  END IF;

  trimmed := NULLIF(TRIM(NEW.company_name), '');
  IF trimmed IS NULL THEN NEW.company_id := NULL; RETURN NEW; END IF;
  SELECT id INTO resolved_id FROM public.companies
    WHERE LOWER(TRIM(name)) = LOWER(trimmed) LIMIT 1;
  IF resolved_id IS NULL THEN
    BEGIN
      INSERT INTO public.companies (name, created_by)
        VALUES (trimmed, NEW.id) RETURNING id INTO resolved_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO resolved_id FROM public.companies
        WHERE LOWER(TRIM(name)) = LOWER(trimmed) LIMIT 1;
    END;
  END IF;
  NEW.company_id := resolved_id;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Approvers can insert overrides" ON public.permit_workflow_overrides;
DROP POLICY IF EXISTS "Approvers can delete overrides" ON public.permit_workflow_overrides;
CREATE POLICY "Admins can insert permit_workflow_overrides"
ON public.permit_workflow_overrides FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update permit_workflow_overrides"
ON public.permit_workflow_overrides FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
-- Keep the existing admin-only DELETE policy and both SELECT policies unchanged.
