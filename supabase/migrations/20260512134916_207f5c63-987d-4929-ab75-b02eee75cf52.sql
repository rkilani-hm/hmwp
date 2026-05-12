-- 1. Drop overly-permissive permit-attachments public read
DROP POLICY IF EXISTS "Anyone can view permit attachments" ON storage.objects;

-- 2. Replace public-role permit PDF write policies with service_role-only
DROP POLICY IF EXISTS "Service can insert permit PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Service can update permit PDFs" ON storage.objects;

CREATE POLICY "Service role can insert permit PDFs"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'permit-pdfs');

CREATE POLICY "Service role can update permit PDFs"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'permit-pdfs')
  WITH CHECK (bucket_id = 'permit-pdfs');

-- 3. Enable RLS on realtime.messages with authenticated-only baseline
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can send realtime messages" ON realtime.messages;

CREATE POLICY "Authenticated can read realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can send realtime messages"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);