-- Add pending_pmd_coordinator and pending_ecovert_supervisor to permit_status enum
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'pending_pmd_coordinator';
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'pending_ecovert_supervisor';