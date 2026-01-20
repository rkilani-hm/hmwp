-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view permits in version chain" ON public.work_permits;

-- The existing RLS policies should handle normal access
-- We don't need a special policy for version chains since:
-- 1. Requesters can already view their own permits (requester_id = auth.uid())
-- 2. When we clone, we copy the requester_id, so they can view the new version too
-- 3. Staff/approvers have broader access through existing policies