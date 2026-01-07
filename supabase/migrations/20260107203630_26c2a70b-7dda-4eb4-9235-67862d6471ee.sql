-- Add company_logo column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_logo text;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own company logo
CREATE POLICY "Users can upload their own company logo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own company logo
CREATE POLICY "Users can update their own company logo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own company logo
CREATE POLICY "Users can delete their own company logo"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public access to view company logos
CREATE POLICY "Anyone can view company logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-logos');