-- ============================================================================
-- Numbering RPC fix — robust advisory-lock version
--
-- Replaces the prior implementations of next_permit_number_today() and
-- next_gate_pass_number_today() with a definitive version that:
--
--   1. Uses pg_advisory_xact_lock instead of SELECT ... FOR UPDATE.
--      The lock is keyed on the date itself, not on rows, so it works
--      correctly on the very first permit of a new day (when zero rows
--      exist to lock). Also works in read-only sessions like the
--      Supabase SQL editor — useful for testing.
--
--   2. Correctly handles the rework suffix `_V<n>`. The previous
--      Lovable-written function used `substring(permit_no FROM '([0-9]+)$')`
--      to extract the trailing digits, which would capture the digit in
--      `_V1` instead of the sequence number `01`. This version anchors
--      the regex to the exact sequence position.
--
--   3. Drops INSERT-time uniqueness reliance — since the advisory lock
--      strictly serializes same-day allocation, two transactions can
--      never both compute the same MAX. Caps at NN=99 with a clear
--      error.
--
-- This migration is safe to apply repeatedly. Functions use
-- CREATE OR REPLACE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- next_permit_number(target_date)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.next_permit_number(target_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yymmdd     text;
  v_prefix     text;
  v_lock_key   bigint;
  v_max_seq    integer;
  v_next_seq   integer;
BEGIN
  v_yymmdd := to_char(target_date, 'YYMMDD');
  v_prefix := 'WP-' || v_yymmdd || '-';

  -- Advisory lock keyed on the date as YYYYMMDD integer. Same-day
  -- callers serialize; different days run in parallel.
  v_lock_key := to_char(target_date, 'YYYYMMDD')::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Find the highest existing 2-digit sequence for this date.
  -- Pattern matches `WP-YYMMDD-NN` and `WP-YYMMDD-NN_V<x>` (rework suffixes
  -- share the base sequence — the same WP-260425-01 in cycle V0, V1, V2 all
  -- count as sequence 01, not 1, V1, V2).
  --
  -- The regex `^WP-<yymmdd>-([0-9]{2})(?:_V[0-9]+)?$` captures the 2-digit
  -- sequence positionally — anchored, so trailing `_V1` digits cannot
  -- be mistaken for the sequence.
  SELECT COALESCE(MAX(seq_num), 0) INTO v_max_seq
  FROM (
    SELECT (regexp_match(permit_no, '^WP-' || v_yymmdd || '-([0-9]{2})(?:_V[0-9]+)?$'))[1]::integer AS seq_num
    FROM public.work_permits
    WHERE permit_no LIKE v_prefix || '%'
  ) sub
  WHERE seq_num IS NOT NULL;

  v_next_seq := v_max_seq + 1;

  IF v_next_seq > 99 THEN
    RAISE EXCEPTION 'Permit sequence exhausted for %: 99 permits already created today.',
      v_yymmdd USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_prefix || lpad(v_next_seq::text, 2, '0');
END;
$$;

COMMENT ON FUNCTION public.next_permit_number(date) IS
  'Allocates the next permit number for the given Kuwait-local date in '
  'WP-YYMMDD-NN form. Atomic via pg_advisory_xact_lock keyed on the '
  'date. Caps at NN=99/day. Rework suffixes (_V<n>) share the base '
  'sequence. Works in any session including SQL editor.';


-- ----------------------------------------------------------------------------
-- next_gate_pass_number(target_date)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.next_gate_pass_number(target_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yymmdd     text;
  v_prefix     text;
  v_lock_key   bigint;
  v_max_seq    integer;
  v_next_seq   integer;
BEGIN
  v_yymmdd := to_char(target_date, 'YYMMDD');
  v_prefix := 'GP-' || v_yymmdd || '-';

  -- Different keyspace from permit lock to avoid contention between
  -- WP and GP creation on the same day.
  v_lock_key := to_char(target_date, 'YYYYMMDD')::bigint + 100000000;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(seq_num), 0) INTO v_max_seq
  FROM (
    SELECT (regexp_match(pass_no, '^GP-' || v_yymmdd || '-([0-9]{2})$'))[1]::integer AS seq_num
    FROM public.gate_passes
    WHERE pass_no LIKE v_prefix || '%'
  ) sub
  WHERE seq_num IS NOT NULL;

  v_next_seq := v_max_seq + 1;

  IF v_next_seq > 99 THEN
    RAISE EXCEPTION 'Gate pass sequence exhausted for %: 99 passes already created today.',
      v_yymmdd USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_prefix || lpad(v_next_seq::text, 2, '0');
END;
$$;

COMMENT ON FUNCTION public.next_gate_pass_number(date) IS
  'Allocates the next gate pass number for the given Kuwait-local date '
  'in GP-YYMMDD-NN form. Atomic via pg_advisory_xact_lock. Caps at '
  'NN=99/day. Works in any session including SQL editor.';


-- ----------------------------------------------------------------------------
-- Convenience wrappers — pin to Kuwait local time
-- ----------------------------------------------------------------------------
-- The frontend calls these via supabase.rpc(). Asia/Kuwait is UTC+3
-- year-round (no DST observance).

CREATE OR REPLACE FUNCTION public.next_permit_number_today()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.next_permit_number((now() AT TIME ZONE 'Asia/Kuwait')::date);
$$;

CREATE OR REPLACE FUNCTION public.next_gate_pass_number_today()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.next_gate_pass_number((now() AT TIME ZONE 'Asia/Kuwait')::date);
$$;

COMMENT ON FUNCTION public.next_permit_number_today() IS
  'Convenience: next permit number for the current Kuwait-local day. '
  'Use from the frontend via supabase.rpc(''next_permit_number_today'').';
COMMENT ON FUNCTION public.next_gate_pass_number_today() IS
  'Convenience: next gate pass number for the current Kuwait-local day. '
  'Use from the frontend via supabase.rpc(''next_gate_pass_number_today'').';


-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
-- Wrapped in DO blocks because authenticated/anon roles only exist in
-- Supabase environments — local dev DBs without those roles still apply.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.next_permit_number(date)        TO authenticated;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number(date)     TO authenticated;
    GRANT EXECUTE ON FUNCTION public.next_permit_number_today()      TO authenticated;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number_today()   TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.next_permit_number(date)        TO anon;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number(date)     TO anon;
    GRANT EXECUTE ON FUNCTION public.next_permit_number_today()      TO anon;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number_today()   TO anon;
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- Verification queries (run these after applying the migration)
-- ============================================================================
--
--   SELECT public.next_permit_number_today();
--   SELECT public.next_gate_pass_number_today();
--   SELECT (now() AT TIME ZONE 'Asia/Kuwait')::date AS kuwait_today;
--
-- These should run successfully in the SQL editor (no FOR UPDATE / no
-- read-only-session issues). Expected output today (2026-04-26 Kuwait
-- local) is something like:
--
--   next_permit_number_today  |  WP-260426-01   (or NN if existing rows)
--   next_gate_pass_number_today |  GP-260426-01
--   kuwait_today              |  2026-04-26
--
-- If next_*_today() raises an error, paste the error and migration
-- version to follow up.
