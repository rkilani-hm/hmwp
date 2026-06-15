-- Re-attach the on_auth_user_created trigger so handle_new_user() actually fires.
-- The function body is correct (already inserts phone/company_name/unit/floor), but no
-- trigger was bound to auth.users — so new profiles were silently being created by the
-- client-side fallback (AuthContext.fetchProfileAndRoles upsert) with only id/email/full_name,
-- discarding phone, company, unit, floor from raw_user_meta_data.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: any existing profile that is missing tenant master data but whose
-- auth.users.raw_user_meta_data has it (i.e. accounts created during the window
-- where the trigger wasn't bound). Only touches columns currently NULL — never
-- overwrites existing values.
UPDATE public.profiles p
   SET phone        = COALESCE(p.phone,
                       NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'phone',        '')), '')),
       company_name = COALESCE(p.company_name,
                       NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'company_name', '')), '')),
       unit         = COALESCE(p.unit,
                       NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'unit',         '')), '')),
       floor        = COALESCE(p.floor,
                       NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'floor',        '')), '')),
       updated_at   = now()
  FROM auth.users au
 WHERE au.id = p.id
   AND (
        (p.phone        IS NULL AND COALESCE(au.raw_user_meta_data->>'phone',        '') <> '')
     OR (p.company_name IS NULL AND COALESCE(au.raw_user_meta_data->>'company_name', '') <> '')
     OR (p.unit         IS NULL AND COALESCE(au.raw_user_meta_data->>'unit',         '') <> '')
     OR (p.floor        IS NULL AND COALESCE(au.raw_user_meta_data->>'floor',        '') <> '')
   );