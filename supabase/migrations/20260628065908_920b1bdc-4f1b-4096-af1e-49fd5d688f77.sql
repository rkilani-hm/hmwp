CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.department_id := OLD.department_id;
    NEW.actor_type    := OLD.actor_type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();