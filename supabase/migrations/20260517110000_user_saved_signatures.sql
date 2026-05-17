-- ====================================================================
-- User saved signatures and initials
-- ====================================================================
--
-- Adds two columns to public.profiles so each user can save a personal
-- signature and initials. These are pre-loaded into the
-- SecureApprovalDialog signature pad when the user goes to approve a
-- work permit or gate pass, removing the need to sign from scratch
-- every time.
--
-- Storage strategy: data URL stored directly on the profile row.
--
--   - Typical signature size: 5–50 KB as PNG data URL
--   - Postgres text columns handle this easily (1 GB max per row)
--   - Avoids the complexity of a separate storage bucket + signed
--     URLs + RLS policies + cleanup-on-delete
--   - The data URL is portable: any <img src> renders it directly
--
-- If signatures grow into the 100s of KB or become very common, this
-- can later migrate to a `user_signatures` table with storage refs.
-- For the initial rollout, on-profile is the simplest path.
--
-- Privacy: a user's signature is sensitive. The default profiles RLS
-- already prevents users from reading each other's profile data;
-- these columns inherit that. The signature is only sent off-row by
-- the verify-signature-approval edge function which embeds it in
-- the approval record.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS initials_data  text,
  ADD COLUMN IF NOT EXISTS signature_updated_at timestamptz;

COMMENT ON COLUMN public.profiles.signature_data IS
  'User''s saved signature as a PNG data URL '
  '(data:image/png;base64,iVBORw0KGgo...). Pre-loaded into the '
  'approval signature pad. NULL = user has not saved one yet.';

COMMENT ON COLUMN public.profiles.initials_data IS
  'User''s saved initials as a PNG data URL. Same format as '
  'signature_data. Used for shorter confirmation flows and '
  'multi-step PDF acknowledgments.';

COMMENT ON COLUMN public.profiles.signature_updated_at IS
  'Set automatically by the BEFORE UPDATE trigger whenever '
  'signature_data or initials_data changes. Useful for audit and '
  'for invalidating cached signature thumbnails.';

-- Auto-update signature_updated_at on changes to either field.
CREATE OR REPLACE FUNCTION public._touch_signature_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.signature_data IS DISTINCT FROM OLD.signature_data
     OR NEW.initials_data IS DISTINCT FROM OLD.initials_data THEN
    NEW.signature_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_signature_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_signature_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public._touch_signature_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
