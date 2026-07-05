-- Fix public permit QR verification for ALL permits
--
-- get_public_permit_status previously only matched permits created via the
-- unauthenticated public request form (is_internal = true AND requester_id IS
-- NULL). Permits created by tenants/staff inside the app carry a requester_id,
-- so scanning their QR on the public /status page returned no row → "Not Found"
-- even though the permit exists (e.g. still in approval).
--
-- The QR verifier needs to resolve ANY real permit by its number and report its
-- status + validity window. The function still returns only non-sensitive
-- fields (permit_no, status, dates) — no requester, contractor, or work detail —
-- so widening the lookup does not leak anything a QR holder doesn't already have.
-- Archived (soft-deleted) permits are excluded so removed records don't resolve.

CREATE OR REPLACE FUNCTION public.get_public_permit_status(_permit_no text)
 RETURNS TABLE(permit_no text, status permit_status, work_date_from date, work_date_to date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wp.permit_no, wp.status, wp.work_date_from, wp.work_date_to
  FROM public.work_permits wp
  WHERE lower(wp.permit_no) = lower(_permit_no)
    AND COALESCE(wp.is_archived, false) = false
  LIMIT 1;
$function$;
