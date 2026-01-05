-- Insert missing profiles for users that exist in user_roles but not in profiles
-- This uses SECURITY DEFINER function approach since we can't directly access auth.users

-- First, let's create profiles for the known user IDs from user_roles
-- We'll need to use the admin functions to sync these

-- Create a function to sync missing profiles (to be called by service role)
CREATE OR REPLACE FUNCTION public.sync_missing_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- For each user in user_roles that doesn't have a profile
  FOR user_record IN 
    SELECT DISTINCT ur.user_id 
    FROM user_roles ur 
    WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = ur.user_id)
  LOOP
    -- Insert a placeholder profile (email will be updated on next login)
    INSERT INTO profiles (id, email, full_name)
    VALUES (
      user_record.user_id, 
      user_record.user_id::text || '@placeholder.local',
      'User ' || substring(user_record.user_id::text, 1, 8)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$;

-- Execute the sync function
SELECT sync_missing_profiles();

-- Drop the function after use (it was only needed for this migration)
DROP FUNCTION IF EXISTS public.sync_missing_profiles();