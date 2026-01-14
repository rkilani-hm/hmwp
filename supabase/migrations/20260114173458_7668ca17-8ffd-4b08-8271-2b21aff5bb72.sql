-- Add authentication preference column to profiles
ALTER TABLE public.profiles 
ADD COLUMN auth_preference text DEFAULT 'password' CHECK (auth_preference IN ('password', 'biometric'));