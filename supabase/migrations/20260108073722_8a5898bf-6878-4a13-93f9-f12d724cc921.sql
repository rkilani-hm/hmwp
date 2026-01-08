-- Fix warn: Restrict signature_audit_logs access to admins only
-- Remove the overly permissive approver access policy
DROP POLICY IF EXISTS "Approvers can view signature logs for their permits" ON public.signature_audit_logs;

-- Fix warn: Tighten profiles table visibility
-- Users should only see their own profile, not all profiles
-- Keep admin access for user management purposes

-- The current policies are appropriate:
-- - "Users can view own profile" - correct
-- - "Admins can view all profiles" - correct for user management
-- - "Users can update own profile" - correct
-- - "Admins can update all profiles" - correct for user management

-- No changes needed for profiles as the policies are already restrictive
-- The warning was about potential PII exposure, but the policies correctly limit access