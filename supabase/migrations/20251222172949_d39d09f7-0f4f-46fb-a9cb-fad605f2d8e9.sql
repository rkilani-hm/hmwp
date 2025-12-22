-- Add 'cancelled' status to permit_status enum
ALTER TYPE public.permit_status ADD VALUE IF NOT EXISTS 'cancelled';