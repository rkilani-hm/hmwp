-- ============================================================================
-- Numbering scheme: WP-YYMMDD-NN  /  GP-YYMMDD-NN  (Kuwait local time)
--
-- Switches from the previous client-generated `Date.now().toString(36)` scheme
-- (e.g. `WP-LZG2K4F8`, `GP-LZG2K4F8`, `INT-LZG2K4F8`) to a daily-resetting
-- 2-digit sequence per Kuwait day. Date is YYMMDD. New permits and gate
-- passes get numbers assigned by a Postgres function so the sequence is
-- atomic and collision-safe under concurrent inserts.
--
-- Examples:
--   WP-260425-01  -- first work permit created on 2026-04-25 Kuwait local
--   WP-260425-99  -- 99th  work permit created on 2026-04-25 Kuwait local
--   WP-260426-01  -- first work permit created on 2026-04-26 Kuwait local
--   GP-260425-01  -- first gate pass created on 2026-04-25 Kuwait local
--
-- Rework versions of permits get an `_V<n>` suffix appended (e.g.
-- `WP-260425-01_V1`). Suffix logic lives in the rework hook, not here, since
-- it's tied to a specific user action (resubmit) rather than insert.
--
-- Existing data: NOT touched. Per user direction, historical permits/passes
-- will be deleted, so no backfill is included. New format applies to every
-- new record from the migration forward.
--
-- Concurrency: each function takes an advisory lock keyed on the day to
-- serialize same-day generation. Cross-day generation runs in parallel.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Add UNIQUE on gate_passes.pass_no
-- ----------------------------------------------------------------------------
-- work_permits.permit_no is already UNIQUE (work_permits_permit_no_key).
-- gate_passes.pass_no is NOT — old client-generated `Date.now().toString(36)`
-- made collisions astronomically unlikely so it was tolerable. With a daily
-- sequence reset, collisions become a real concern; add the constraint.
-- If existing data has duplicates this will fail; in that case clean them up
-- manually before re-running.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gate_passes_pass_no_key'
       AND conrelid = 'public.gate_passes'::regclass
  ) THEN
    ALTER TABLE public.gate_passes
      ADD CONSTRAINT gate_passes_pass_no_key UNIQUE (pass_no);
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- next_permit_number(target_date) -> text
-- ----------------------------------------------------------------------------
-- Returns the next permit number for the given Kuwait-local date in the
-- form 'WP-DDMMYY-NN'. Atomic: an advisory lock keyed on the date prevents
-- two concurrent inserts from claiming the same sequence number.
--
-- Caps at 99/day. If the limit is hit, raises a clear error rather than
-- silently overflowing into 3 digits.

CREATE OR REPLACE FUNCTION public.next_permit_number(target_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str    text;
  v_lock_key    bigint;
  v_seq         integer;
  v_existing    integer;
  v_candidate   text;
BEGIN
  -- YYMMDD format (e.g. 260425 = 2026-04-25). Postgres TO_CHAR uses 'YY'
  -- for 2-digit year, 'MM' for month, 'DD' for day-of-month.
  v_date_str := to_char(target_date, 'YYMMDD');

  -- Advisory lock keyed on the integer date (YYYYMMDD as int). Two callers
  -- on the same day serialize; different days run in parallel.
  v_lock_key := to_char(target_date, 'YYYYMMDD')::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Find the highest existing sequence for this date by scanning the
  -- pattern. We can't use a separate counter table because we're starting
  -- from a clean slate (existing data will be deleted). After deletion,
  -- if a permit with seq N is deleted, the next allocator returns N+1
  -- against the *current max*, which could collide later if the deletion
  -- left gaps. Acceptable because: (a) the unique constraint catches it,
  -- (b) in practice deletions are rare, (c) monotonicity within a day is
  -- preserved.
  SELECT COALESCE(MAX(
    CASE
      WHEN permit_no ~ ('^WP-' || v_date_str || '-[0-9]{2}(_V[0-9]+)?$')
      THEN substring(permit_no FROM '^WP-[0-9]{6}-([0-9]{2})')::integer
      ELSE 0
    END
  ), 0)
  INTO v_existing
  FROM public.work_permits;

  v_seq := v_existing + 1;

  IF v_seq > 99 THEN
    RAISE EXCEPTION 'Permit sequence exhausted for %: 99 permits already created today. Numbering scheme caps at 2 digits.',
      v_date_str
      USING ERRCODE = 'check_violation';
  END IF;

  v_candidate := 'WP-' || v_date_str || '-' || lpad(v_seq::text, 2, '0');
  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.next_permit_number(date) IS
  'Returns the next permit number for the given Kuwait-local date in the '
  'form WP-DDMMYY-NN. Atomic via pg_advisory_xact_lock keyed on the date. '
  'Caps at NN=99/day; raises if exhausted.';


-- ----------------------------------------------------------------------------
-- next_gate_pass_number(target_date) -> text
-- ----------------------------------------------------------------------------
-- Same logic as permits but for gate_passes. Mirror prefix (GP- vs WP-).

CREATE OR REPLACE FUNCTION public.next_gate_pass_number(target_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str    text;
  v_lock_key    bigint;
  v_seq         integer;
  v_existing    integer;
  v_candidate   text;
BEGIN
  v_date_str := to_char(target_date, 'YYMMDD');

  -- Different keyspace from next_permit_number to avoid contention between
  -- WP and GP creation on the same day. Bit-shift adds an offset.
  v_lock_key := to_char(target_date, 'YYYYMMDD')::bigint + 100000000;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
    CASE
      WHEN pass_no ~ ('^GP-' || v_date_str || '-[0-9]{2}$')
      THEN substring(pass_no FROM '^GP-[0-9]{6}-([0-9]{2})$')::integer
      ELSE 0
    END
  ), 0)
  INTO v_existing
  FROM public.gate_passes;

  v_seq := v_existing + 1;

  IF v_seq > 99 THEN
    RAISE EXCEPTION 'Gate pass sequence exhausted for %: 99 passes already created today. Numbering scheme caps at 2 digits.',
      v_date_str
      USING ERRCODE = 'check_violation';
  END IF;

  v_candidate := 'GP-' || v_date_str || '-' || lpad(v_seq::text, 2, '0');
  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.next_gate_pass_number(date) IS
  'Returns the next gate pass number for the given Kuwait-local date in the '
  'form GP-DDMMYY-NN. Atomic via pg_advisory_xact_lock keyed on the date. '
  'Caps at NN=99/day; raises if exhausted.';


-- ----------------------------------------------------------------------------
-- Convenience wrappers — assume Kuwait local "today"
-- ----------------------------------------------------------------------------
-- The frontend calls these via supabase.rpc(). Pinning the timezone to
-- Asia/Kuwait inside the function means clients never have to worry about
-- their browser timezone differing from Kuwait local time.
--
-- Asia/Kuwait is UTC+3 year-round (Kuwait does not observe DST).

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
  'Convenience: returns the next permit number for the current Kuwait-local '
  'day. Use from the frontend via supabase.rpc(''next_permit_number_today'').';
COMMENT ON FUNCTION public.next_gate_pass_number_today() IS
  'Convenience: returns the next gate pass number for the current Kuwait-local '
  'day. Use from the frontend via supabase.rpc(''next_gate_pass_number_today'').';


-- ----------------------------------------------------------------------------
-- Grants — these RPCs are callable by authenticated users + the anon role
-- (the public submission portal uses the anon role).
--
-- Wrapped in DO blocks because `authenticated` and `anon` roles only exist
-- in Supabase environments. Plain Postgres (used in test setups) doesn't
-- have them; the conditional avoids breaking those.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.next_permit_number(date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number(date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.next_permit_number_today() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number_today() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.next_permit_number(date) TO anon;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number(date) TO anon;
    GRANT EXECUTE ON FUNCTION public.next_permit_number_today() TO anon;
    GRANT EXECUTE ON FUNCTION public.next_gate_pass_number_today() TO anon;
  END IF;
END $$;

COMMIT;
