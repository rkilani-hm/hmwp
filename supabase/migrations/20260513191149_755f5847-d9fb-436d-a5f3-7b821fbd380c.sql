ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS floor text;

NOTIFY pgrst, 'reload schema';