CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tenant_role_id uuid;
  initial_status text;
  v_phone text;
  v_company text;
BEGIN
  IF NEW.raw_user_meta_data->>'admin_created' = 'true' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  v_phone := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
  v_company := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');

  INSERT INTO public.profiles (id, email, full_name, phone, company_name, account_status, account_approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_phone,
    v_company,
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;
  IF tenant_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, tenant_role_id);
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';