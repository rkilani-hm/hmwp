-- User saved signatures: store reusable signature & initials on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS initials_data text,
  ADD COLUMN IF NOT EXISTS signature_updated_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.touch_signature_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.signature_data IS DISTINCT FROM OLD.signature_data)
     OR (NEW.initials_data IS DISTINCT FROM OLD.initials_data) THEN
    NEW.signature_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_touch_signature ON public.profiles;
CREATE TRIGGER trg_profiles_touch_signature
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.touch_signature_updated_at();