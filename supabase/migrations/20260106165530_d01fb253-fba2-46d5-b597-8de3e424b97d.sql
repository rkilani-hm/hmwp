-- Create a public bucket for company assets like logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to company assets
CREATE POLICY "Company assets are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'company-assets');

-- Allow admins to upload company assets
CREATE POLICY "Admins can upload company assets" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'company-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update company assets" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'company-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete company assets" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'company-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);