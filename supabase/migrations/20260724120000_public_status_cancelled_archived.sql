-- Public permit verification: distinguish CANCELLED / EXPIRED from "does not exist".
--
-- Before: the RPC dropped every archived permit, so a cancelled permit that had
-- also been archived returned nothing and the public page said "Not Found" —
-- indistinguishable from a permit number that never existed. Security reads
-- "not found" as a possible mis-scan and calls to check, instead of being told
-- plainly that the permit is cancelled.
--
-- The rule is enforced HERE rather than in the page, so a direct call to the
-- RPC cannot reveal more than the page shows:
--   1. cancelled / rejected  -> returned even when archived (informative, and
--                               always a negative verdict so nothing can be
--                               waved through on the strength of it)
--   2. archived (any other status) -> withheld entirely, so the caller cannot
--                               tell it apart from a permit number that never
--                               existed. This is what stops an archived-but-
--                               approved permit ever reading as valid at a gate.
--   3. otherwise -> returned; the page derives EXPIRED etc. from the dates.
--
-- Still returns only permit_no, status and the work dates — no requester,
-- contractor, description or location.

CREATE OR REPLACE FUNCTION public.get_public_permit_status(_permit_no text)
RETURNS TABLE (
  permit_no      text,
  status         text,
  work_date_from date,
  work_date_to   date,
  is_archived    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wp.permit_no,
         wp.status,
         wp.work_date_from,
         wp.work_date_to,
         COALESCE(wp.is_archived, false)
  FROM public.work_permits wp
  WHERE lower(wp.permit_no) = lower(_permit_no)
    AND (
      NOT COALESCE(wp.is_archived, false)
      OR wp.status IN ('cancelled', 'rejected')
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_permit_status(text) TO anon, authenticated;
