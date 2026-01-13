-- Add fmsp_approval columns to work_permits table
ALTER TABLE public.work_permits
ADD COLUMN IF NOT EXISTS fmsp_approval_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS fmsp_approval_approver_name text,
ADD COLUMN IF NOT EXISTS fmsp_approval_approver_email text,
ADD COLUMN IF NOT EXISTS fmsp_approval_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS fmsp_approval_comments text,
ADD COLUMN IF NOT EXISTS fmsp_approval_signature text;

-- Add the new pending status to the permit_status enum
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'pending_fmsp_approval';