-- Step 1: Drop storage policies that depend on the old role column first
DROP POLICY IF EXISTS "Admins can upload company assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update company assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete company assets" ON storage.objects;

-- Step 2: Add a new column to link to the roles table
ALTER TABLE public.user_roles ADD COLUMN role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE;

-- Step 3: Migrate existing enum values to role_id by matching role names
UPDATE public.user_roles ur
SET role_id = r.id
FROM public.roles r
WHERE r.name = ur.role::text;

-- Step 4: Make role_id NOT NULL after migration
ALTER TABLE public.user_roles ALTER COLUMN role_id SET NOT NULL;

-- Step 5: Drop the old enum column
ALTER TABLE public.user_roles DROP COLUMN role;

-- Step 6: Add unique constraint on user_id + role_id
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role_id);

-- Step 7: Create updated has_role function that works with the new structure
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.name = _role::text
  )
$$;

-- Step 8: Update is_approver function
CREATE OR REPLACE FUNCTION public.is_approver(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.name IN ('helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout', 'soft_facilities', 'hard_facilities', 'pm_service', 'admin')
  )
$$;

-- Step 9: Update handle_new_user to use role_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contractor_role_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Get the contractor role id
  SELECT id INTO contractor_role_id FROM public.roles WHERE name = 'contractor' LIMIT 1;
  
  -- Default role is contractor
  IF contractor_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, contractor_role_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 10: Recreate storage policies using the has_role function
CREATE POLICY "Admins can upload company assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('company-assets', 'company-logos') 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update company assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('company-assets', 'company-logos') 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete company assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('company-assets', 'company-logos') 
  AND public.has_role(auth.uid(), 'admin')
);