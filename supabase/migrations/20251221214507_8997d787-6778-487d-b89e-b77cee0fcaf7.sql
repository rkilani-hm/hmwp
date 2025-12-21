-- Drop the incorrect policy
DROP POLICY IF EXISTS "Authenticated users can upload permit attachments" ON storage.objects;

-- Create a corrected policy that allows authenticated users to upload
CREATE POLICY "Authenticated users can upload permit attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'permit-attachments' AND auth.uid() IS NOT NULL);