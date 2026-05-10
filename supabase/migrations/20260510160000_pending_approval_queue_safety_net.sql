-- Safety-net follow-up to 20260510140000_pending_approval_queue.sql.
--
-- A production '/pending-tenants' admin page is reporting "Failed to
-- load pending approvals." The most likely cause is that the
-- 20260510140000 migration didn't run cleanly (a deploy that processed
-- multiple migrations in one batch where an earlier one warned and
-- skipped subsequent steps), so the columns the queue UI relies on
-- (account_status, account_approved_at, account_rejected_at,
-- account_rejection_reason, account_reviewed_by) may not exist on
-- profiles even though they're present in the migration file.
--
-- This migration is idempotent. It:
--   1. Re-adds the columns if missing (the original used IF NOT
--      EXISTS too, so re-running the same statements has no side
--      effect on a healthy database).
--   2. Backfills account_status='approved' for any existing profile
--      that already lived through the original grandfather step but
--      somehow ended up at the new column default ('pending') —
--      defensive only; expected to update zero rows on a healthy db.
--   3. NOTIFY pgrst to refresh PostgREST's schema introspection
--      cache. PostgREST caches the column list at startup; if the
--      original DDL ran AFTER PostgREST's last cache refresh, the
--      API returns 'column not found' even though the column exists.
--
-- This is a low-risk no-op on a healthy database. Apply it whenever
-- Lovable next deploys; the supabase_migrations registry prevents
-- duplicate runs.

-- ---------------------------------------------------------------
-- 1. Ensure the columns exist
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'account_status'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN account_status text NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending', 'approved', 'rejected'));
    RAISE NOTICE 'safety-net: added profiles.account_status';
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS account_rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS account_rejection_reason text,
  ADD COLUMN IF NOT EXISTS account_reviewed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 2. Defensive backfill
--
-- If 20260510140000's UPDATE step didn't run, every row would currently
-- read account_status='pending'. The original migration was authored
-- 2026-05-10 14:00 UTC; any profile created before then is pre-queue
-- and must be approved so legitimate users aren't suddenly locked
-- out. The cutoff is hard-coded so re-running this migration won't
-- ever approve fresh signups.
-- ---------------------------------------------------------------
DO $$
DECLARE
  rows_updated int;
BEGIN
  UPDATE public.profiles
     SET account_status      = 'approved',
         account_approved_at = COALESCE(account_approved_at, created_at)
   WHERE account_status = 'pending'
     AND created_at < TIMESTAMPTZ '2026-05-10 14:00:00+00';

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated > 0 THEN
    RAISE NOTICE 'safety-net: grandfather-approved % pre-existing profiles', rows_updated;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. Force PostgREST to refresh its schema cache.
--
-- Without this, even with the columns present in pg_catalog, the
-- API may still 400 on ?account_status=eq.pending until PostgREST
-- restarts on its own (which can take a long time on managed
-- platforms).
-- ---------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
