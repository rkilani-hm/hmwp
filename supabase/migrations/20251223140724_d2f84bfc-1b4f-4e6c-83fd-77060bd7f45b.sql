-- Make storage buckets private
UPDATE storage.buckets SET public = false WHERE id = 'permit-attachments';
UPDATE storage.buckets SET public = false WHERE id = 'permit-pdfs';

-- Add RLS policies for storage access
-- Policy: Users can view their own permit attachments
CREATE POLICY "Users can view own permit attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'permit-attachments' AND
  (
    -- User owns the file (path starts with their ID or permit ID they own)
    EXISTS (
      SELECT 1 FROM work_permits 
      WHERE work_permits.requester_id = auth.uid() 
      AND storage.objects.name LIKE '%' || work_permits.id::text || '%'
    )
    OR
    -- User is an approver
    is_approver(auth.uid())
    OR
    -- Admin
    has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Policy: Users can upload to permit-attachments
CREATE POLICY "Users can upload permit attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'permit-attachments' AND
  auth.uid() IS NOT NULL
);

-- Policy: Users can view permit PDFs they have access to
CREATE POLICY "Users can view permit PDFs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'permit-pdfs' AND
  (
    -- User owns the permit
    EXISTS (
      SELECT 1 FROM work_permits 
      WHERE work_permits.requester_id = auth.uid() 
      AND storage.objects.name LIKE '%' || work_permits.permit_no || '%'
    )
    OR
    -- User is an approver
    is_approver(auth.uid())
    OR
    -- Admin
    has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Policy: Service role can insert PDFs (for edge function)
CREATE POLICY "Service can insert permit PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'permit-pdfs'
);

-- Policy: Service role can update PDFs (for edge function with upsert)
CREATE POLICY "Service can update permit PDFs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'permit-pdfs');