-- Add new role values to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ecovert_supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pmd_coordinator';

-- Update work_types table: add new columns and remove old ones
ALTER TABLE public.work_types 
  ADD COLUMN IF NOT EXISTS requires_ecovert_supervisor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_pmd_coordinator boolean DEFAULT false;

-- Drop old columns from work_types
ALTER TABLE public.work_types 
  DROP COLUMN IF EXISTS requires_soft_facilities,
  DROP COLUMN IF EXISTS requires_hard_facilities,
  DROP COLUMN IF EXISTS requires_pm_service;

-- Add new approval fields to work_permits
ALTER TABLE public.work_permits
  ADD COLUMN IF NOT EXISTS ecovert_supervisor_status text,
  ADD COLUMN IF NOT EXISTS ecovert_supervisor_approver_name text,
  ADD COLUMN IF NOT EXISTS ecovert_supervisor_approver_email text,
  ADD COLUMN IF NOT EXISTS ecovert_supervisor_date timestamptz,
  ADD COLUMN IF NOT EXISTS ecovert_supervisor_comments text,
  ADD COLUMN IF NOT EXISTS ecovert_supervisor_signature text,
  ADD COLUMN IF NOT EXISTS pmd_coordinator_status text,
  ADD COLUMN IF NOT EXISTS pmd_coordinator_approver_name text,
  ADD COLUMN IF NOT EXISTS pmd_coordinator_approver_email text,
  ADD COLUMN IF NOT EXISTS pmd_coordinator_date timestamptz,
  ADD COLUMN IF NOT EXISTS pmd_coordinator_comments text,
  ADD COLUMN IF NOT EXISTS pmd_coordinator_signature text;

-- Drop old approval columns from work_permits
ALTER TABLE public.work_permits
  DROP COLUMN IF EXISTS soft_facilities_status,
  DROP COLUMN IF EXISTS soft_facilities_approver_name,
  DROP COLUMN IF EXISTS soft_facilities_approver_email,
  DROP COLUMN IF EXISTS soft_facilities_date,
  DROP COLUMN IF EXISTS soft_facilities_comments,
  DROP COLUMN IF EXISTS soft_facilities_signature,
  DROP COLUMN IF EXISTS hard_facilities_status,
  DROP COLUMN IF EXISTS hard_facilities_approver_name,
  DROP COLUMN IF EXISTS hard_facilities_approver_email,
  DROP COLUMN IF EXISTS hard_facilities_date,
  DROP COLUMN IF EXISTS hard_facilities_comments,
  DROP COLUMN IF EXISTS hard_facilities_signature,
  DROP COLUMN IF EXISTS pm_service_status,
  DROP COLUMN IF EXISTS pm_service_approver_name,
  DROP COLUMN IF EXISTS pm_service_approver_email,
  DROP COLUMN IF EXISTS pm_service_date,
  DROP COLUMN IF EXISTS pm_service_comments,
  DROP COLUMN IF EXISTS pm_service_signature;

-- Delete old roles from user_roles (migrate users if needed)
DELETE FROM public.user_roles WHERE role IN ('soft_facilities', 'hard_facilities', 'pm_service');