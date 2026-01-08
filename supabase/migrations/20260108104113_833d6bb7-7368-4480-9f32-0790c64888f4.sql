-- Add rework tracking columns to work_permits table
ALTER TABLE public.work_permits
ADD COLUMN IF NOT EXISTS rework_version integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS rework_comments text;

-- Add rework_needed to the permit_status enum
ALTER TYPE permit_status ADD VALUE IF NOT EXISTS 'rework_needed' AFTER 'under_review';