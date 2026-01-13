
-- Fix: Set search_path on the helper function
CREATE OR REPLACE FUNCTION public.get_pending_status_for_role(role_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT 'pending_' || role_name
$$;
