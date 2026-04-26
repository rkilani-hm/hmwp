BEGIN;

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

  v_lock_key := to_char(target_date, 'YYYYMMDD')::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

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
  'Allocates the next permit number for the given Kuwait-local date in WP-YYMMDD-NN form. Atomic via pg_advisory_xact_lock keyed on the date. Caps at NN=99/day. Rework suffixes (_V<n>) share the base sequence. Works in any session including SQL editor.';

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
  'Allocates the next gate pass number for the given Kuwait-local date in GP-YYMMDD-NN form. Atomic via pg_advisory_xact_lock. Caps at NN=99/day. Works in any session including SQL editor.';

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
  'Convenience: next permit number for the current Kuwait-local day. Use from the frontend via supabase.rpc(''next_permit_number_today'').';
COMMENT ON FUNCTION public.next_gate_pass_number_today() IS
  'Convenience: next gate pass number for the current Kuwait-local day. Use from the frontend via supabase.rpc(''next_gate_pass_number_today'').';

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