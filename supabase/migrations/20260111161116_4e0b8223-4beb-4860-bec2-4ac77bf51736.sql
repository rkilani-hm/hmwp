-- Add is_internal flag to work_permits to distinguish internal permits from client permits
ALTER TABLE public.work_permits 
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- Add external requester fields for public/QR code submissions (no login required)
ALTER TABLE public.work_permits 
  ADD COLUMN IF NOT EXISTS external_company_name TEXT,
  ADD COLUMN IF NOT EXISTS external_contact_person TEXT;

-- Allow requester_id to be null for public submissions (already nullable)
-- No change needed

-- Create RLS policy to allow anonymous inserts for internal permits
CREATE POLICY "Allow anonymous internal permit creation" 
  ON public.work_permits 
  FOR INSERT 
  WITH CHECK (is_internal = true AND requester_id IS NULL);

-- Allow anonymous users to view their own permit by permit number (for confirmation)
CREATE POLICY "Allow anonymous view by permit number" 
  ON public.work_permits 
  FOR SELECT 
  USING (is_internal = true AND requester_id IS NULL);

-- Create index for internal permits queries
CREATE INDEX IF NOT EXISTS idx_work_permits_is_internal ON public.work_permits(is_internal) WHERE is_internal = true;