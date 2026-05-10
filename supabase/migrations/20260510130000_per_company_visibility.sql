-- Per-company visibility for tenants.
--
-- Background: until now a tenant could only SELECT permits/gate-passes
-- where `requester_id = auth.uid()`. With multiple users from the same
-- tenant company (e.g. two employees from "Acme Corp" each having their
-- own login), each saw only their own submissions. This migration
-- broadens tenant SELECT visibility to include rows submitted by any
-- profile whose `company_name` matches the viewer's, case-insensitive
-- and trim-normalised.
--
-- Scope of widening: SELECT only. INSERT and UPDATE policies remain
-- per-user (`requester_id = auth.uid()`); tenants can see their
-- colleagues' submissions but cannot edit or delete them.
--
-- Limitation: `profiles.company_name` is free text. Two tenants from
-- the same company who type the company name slightly differently
-- (e.g. "Acme Corp" vs "ACME Corporation") still won't see each other's
-- permits. A future migration could introduce a normalised `companies`
-- table with FK relationships; for now we live with the free-text
-- limitation, which the user explicitly accepted (option 5B).
--
-- Affected policies (all SELECT, all tenant-side):
--   1. work_permits      "Users can view own permits"
--   2. gate_passes       "Users can view own gate passes"
--   3. permit_approvals  "Requesters can view their permit approvals"
--   4. gate_pass_approvals "Requesters can view their gate pass approvals"
--   5. gate_pass_items   "Users can view items of own gate passes"
--   6. signature_audit_logs "Users can view signature logs for own permits"
--   7. signature_audit_logs "Users can view signature logs for own gate passes"
--
-- Approver-side policies (`is_approver(auth.uid())`,
-- `is_gate_pass_approver(auth.uid())`) are untouched — approvers
-- continue to see all rows.

-- ---------------------------------------------------------------
-- Helper function: same_company(uuid, uuid) → boolean
--
-- Returns TRUE when both user IDs are non-null, distinct, and both
-- profiles have a non-empty company_name that compares equal after
-- LOWER+TRIM. NULL or empty company_name on either side returns FALSE
-- (so users without a company can never match each other).
--
-- SECURITY DEFINER so it can read profiles regardless of caller's RLS.
-- STABLE so postgres can cache results within a single statement.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.same_company(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_a IS NOT NULL
     AND _user_b IS NOT NULL
     AND _user_a <> _user_b
     AND EXISTS (
       SELECT 1
       FROM public.profiles a
       JOIN public.profiles b
         ON LOWER(TRIM(a.company_name)) = LOWER(TRIM(b.company_name))
       WHERE a.id = _user_a
         AND b.id = _user_b
         AND NULLIF(TRIM(a.company_name), '') IS NOT NULL
         AND NULLIF(TRIM(b.company_name), '') IS NOT NULL
     );
$$;

COMMENT ON FUNCTION public.same_company(uuid, uuid) IS
  'True if both users have non-empty matching company_name (LOWER+TRIM). Used by per-company RLS policies on work_permits, gate_passes and their child tables.';

-- ---------------------------------------------------------------
-- 1. work_permits — tenant SELECT
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own permits" ON public.work_permits;
DROP POLICY IF EXISTS "Users can view own or company permits" ON public.work_permits;

CREATE POLICY "Users can view own or company permits"
  ON public.work_permits
  FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.same_company(auth.uid(), requester_id)
  );

-- ---------------------------------------------------------------
-- 2. gate_passes — tenant SELECT
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own gate passes" ON public.gate_passes;
DROP POLICY IF EXISTS "Users can view own or company gate passes" ON public.gate_passes;

CREATE POLICY "Users can view own or company gate passes"
  ON public.gate_passes
  FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.same_company(auth.uid(), requester_id)
  );

-- ---------------------------------------------------------------
-- 3. permit_approvals — tenant SELECT (cascading via work_permits)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Requesters can view their permit approvals" ON public.permit_approvals;
DROP POLICY IF EXISTS "Requesters can view their or company permit approvals" ON public.permit_approvals;

CREATE POLICY "Requesters can view their or company permit approvals"
  ON public.permit_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.work_permits wp
      WHERE wp.id = permit_approvals.permit_id
        AND (
          wp.requester_id = auth.uid()
          OR public.same_company(auth.uid(), wp.requester_id)
        )
    )
  );

-- ---------------------------------------------------------------
-- 4. gate_pass_approvals — tenant SELECT (cascading via gate_passes)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Requesters can view their gate pass approvals" ON public.gate_pass_approvals;
DROP POLICY IF EXISTS "Requesters can view their or company gate pass approvals" ON public.gate_pass_approvals;

CREATE POLICY "Requesters can view their or company gate pass approvals"
  ON public.gate_pass_approvals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.gate_passes gp
      WHERE gp.id = gate_pass_approvals.gate_pass_id
        AND (
          gp.requester_id = auth.uid()
          OR public.same_company(auth.uid(), gp.requester_id)
        )
    )
  );

-- ---------------------------------------------------------------
-- 5. gate_pass_items — tenant SELECT (cascading via gate_passes)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view items of own gate passes" ON public.gate_pass_items;
DROP POLICY IF EXISTS "Users can view items of own or company gate passes" ON public.gate_pass_items;

CREATE POLICY "Users can view items of own or company gate passes"
  ON public.gate_pass_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.gate_passes gp
      WHERE gp.id = gate_pass_items.gate_pass_id
        AND (
          gp.requester_id = auth.uid()
          OR public.same_company(auth.uid(), gp.requester_id)
        )
    )
  );

-- ---------------------------------------------------------------
-- 6. signature_audit_logs — tenant SELECT for permit-side
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view signature logs for own permits" ON public.signature_audit_logs;
DROP POLICY IF EXISTS "Users can view signature logs for own or company permits" ON public.signature_audit_logs;

CREATE POLICY "Users can view signature logs for own or company permits"
  ON public.signature_audit_logs
  FOR SELECT
  USING (
    permit_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.work_permits wp
      WHERE wp.id = signature_audit_logs.permit_id
        AND (
          wp.requester_id = auth.uid()
          OR public.same_company(auth.uid(), wp.requester_id)
        )
    )
  );

-- ---------------------------------------------------------------
-- 7. signature_audit_logs — tenant SELECT for gate-pass-side
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view signature logs for own gate passes" ON public.signature_audit_logs;
DROP POLICY IF EXISTS "Users can view signature logs for own or company gate passes" ON public.signature_audit_logs;

CREATE POLICY "Users can view signature logs for own or company gate passes"
  ON public.signature_audit_logs
  FOR SELECT
  USING (
    gate_pass_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.gate_passes gp
      WHERE gp.id = signature_audit_logs.gate_pass_id
        AND (
          gp.requester_id = auth.uid()
          OR public.same_company(auth.uid(), gp.requester_id)
        )
    )
  );
