-- Create storage bucket for permit PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('permit-pdfs', 'permit-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read PDFs
CREATE POLICY "Authenticated users can read permit PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'permit-pdfs');

-- Allow authenticated users to upload PDFs (for edge function with service role)
CREATE POLICY "Service role can upload permit PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'permit-pdfs');