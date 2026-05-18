CREATE OR REPLACE FUNCTION public.filter_tenant_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_tenant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.user_id
      AND r.name = 'tenant'
  ) INTO v_is_tenant;

  IF v_is_tenant AND NEW.type NOT IN (
    'permit_submitted',
    'permit_approved',
    'permit_rejected',
    'gatepass_submitted',
    'gatepass_approved',
    'gatepass_rejected'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;