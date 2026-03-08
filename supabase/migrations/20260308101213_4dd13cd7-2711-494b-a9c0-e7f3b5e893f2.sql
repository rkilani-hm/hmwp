
-- Add soft-delete columns to work_permits
ALTER TABLE public.work_permits
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Add soft-delete columns to gate_passes
ALTER TABLE public.gate_passes
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Create admin deletion audit log table
CREATE TABLE IF NOT EXISTS public.admin_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL, -- 'work_permit' or 'gate_pass'
  record_id uuid NOT NULL,
  record_identifier text NOT NULL, -- permit_no or pass_no
  record_details text, -- extra info like requester name
  action text NOT NULL, -- 'archived', 'restored', 'permanently_deleted'
  performed_by uuid NOT NULL,
  performed_by_name text NOT NULL,
  performed_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_deletion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin_deletion_logs"
ON public.admin_deletion_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
