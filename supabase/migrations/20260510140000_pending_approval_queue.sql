-- Pending approval queue for new tenant signups.
--
-- Background: until now any self-signup at /auth was immediately able
-- to submit work permits and gate-pass requests. The two-tier user
-- model splits signups into two paths:
--   * Self-signups (tenants) land in account_status='pending' and
--     cannot submit until an admin approves them.
--   * Admin-created users (via admin-create-user edge function) skip
--     the queue and land as 'approved' immediately.
-- Existing users are grandfathered to 'approved' in this migration so
-- nobody is suddenly locked out.
--
-- Out of scope for this migration:
--   * Email notifications when a new tenant signs up or when an admin
--     approves/rejects (see follow-up).
--   * RLS broadening for account_status visibility — admins already
--     have "Admins can view all profiles" SELECT policy; tenants see
--     their own profile (and therefore their own account_status) via
--     "Users can view own profile". No new policies needed.

-- ---------------------------------------------------------------
-- 1. Schema: account_status + audit columns on profiles
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN account_status text NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_rejection_reason text,
  ADD COLUMN IF NOT EXISTS account_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 2. Grandfather: every existing profile becomes 'approved'.
--
-- Without this, every existing user would suddenly be locked out
-- on the next deploy. Set account_approved_at to created_at so the
-- audit trail is sensible.
-- ---------------------------------------------------------------
UPDATE public.profiles
SET
  account_status = 'approved',
  account_approved_at = COALESCE(account_approved_at, created_at)
WHERE account_status = 'pending';

-- ---------------------------------------------------------------
-- 3. Index for admin pending-queue queries
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_account_status_pending
  ON public.profiles (account_status, created_at DESC)
  WHERE account_status = 'pending';

-- ---------------------------------------------------------------
-- 4. Helper: current user's account_status (used in WITH CHECK clauses)
--
-- SECURITY DEFINER so RLS recursion can't trip us up. STABLE so
-- postgres can cache within a statement.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_account_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT account_status FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_account_status() IS
  'Returns account_status of the calling user (pending/approved/rejected). Used by INSERT RLS WITH CHECK clauses on submission tables.';

-- ---------------------------------------------------------------
-- 5. Update handle_new_user — read admin_created flag from metadata.
--
-- Self-signups have no metadata.admin_created → land as 'pending'
-- (the column DEFAULT, but we set it explicitly for clarity).
-- Admin-created users (via admin-create-user edge function) pass
-- user_metadata.admin_created='true' → land as 'approved' so they
-- never see the pending queue themselves.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tenant_role_id uuid;
  initial_status text;
BEGIN
  -- Admin-created users are pre-approved; self-signups are pending.
  IF NEW.raw_user_meta_data->>'admin_created' = 'true' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, account_status, account_approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  -- Get the tenant role id (was 'contractor' before the rename PR).
  SELECT id INTO tenant_role_id
  FROM public.roles
  WHERE name = 'tenant'
  LIMIT 1;

  IF tenant_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, tenant_role_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- 6. RLS: block submission while not approved.
--
-- WITH CHECK clauses on INSERT now require account_status='approved'.
-- Pending or rejected users are denied at the database boundary,
-- regardless of any client-side gating.
--
-- UPDATE policies are NOT restricted — a pending user finishing a
-- draft they started before status changed can still update it.
-- The INSERT block alone is sufficient to keep new submissions
-- behind the approval gate.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create permits" ON public.work_permits;

CREATE POLICY "Users can create permits"
  ON public.work_permits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND public.current_user_account_status() = 'approved'
  );

DROP POLICY IF EXISTS "Users can create gate passes" ON public.gate_passes;

CREATE POLICY "Users can create gate passes"
  ON public.gate_passes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND public.current_user_account_status() = 'approved'
  );

-- ---------------------------------------------------------------
-- 7. Approver/admin policies are unaffected.
--
-- - Approvers viewing/updating other users' permits: untouched.
-- - Anonymous /request-permit submissions (requester_id = null):
--   covered by a separate "Allow anonymous internal permit creation"
--   policy that doesn't reference account_status — anon path
--   continues to work unchanged.
-- - admin-create-user edge function bypasses RLS (uses service role)
--   so it can still create users while they're pending or approved.
-- ---------------------------------------------------------------
