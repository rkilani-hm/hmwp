-- Atomic numbering for work permits: WP-YYMMDD-NN, Asia/Kuwait day
CREATE OR REPLACE FUNCTION public.next_permit_number_today()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today_kw date := (now() AT TIME ZONE 'Asia/Kuwait')::date;
  _yymmdd   text := to_char(_today_kw, 'YYMMDD');
  _prefix   text := 'WP-' || _yymmdd || '-';
  _max_n    int;
  _next_n   int;
BEGIN
  -- Lock today's rows to serialize concurrent allocations
  PERFORM 1
  FROM public.work_permits
  WHERE permit_no LIKE _prefix || '%'
  FOR UPDATE;

  SELECT COALESCE(MAX( NULLIF(substring(permit_no FROM '([0-9]+)$'), '')::int ), 0)
    INTO _max_n
    FROM public.work_permits
   WHERE permit_no LIKE _prefix || '%';

  _next_n := _max_n + 1;
  RETURN _prefix || lpad(_next_n::text, 2, '0');
END;
$$;

-- Atomic numbering for gate passes: GP-YYMMDD-NN, Asia/Kuwait day
CREATE OR REPLACE FUNCTION public.next_gate_pass_number_today()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today_kw date := (now() AT TIME ZONE 'Asia/Kuwait')::date;
  _yymmdd   text := to_char(_today_kw, 'YYMMDD');
  _prefix   text := 'GP-' || _yymmdd || '-';
  _max_n    int;
  _next_n   int;
BEGIN
  PERFORM 1
  FROM public.gate_passes
  WHERE pass_no LIKE _prefix || '%'
  FOR UPDATE;

  SELECT COALESCE(MAX( NULLIF(substring(pass_no FROM '([0-9]+)$'), '')::int ), 0)
    INTO _max_n
    FROM public.gate_passes
   WHERE pass_no LIKE _prefix || '%';

  _next_n := _max_n + 1;
  RETURN _prefix || lpad(_next_n::text, 2, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_permit_number_today()    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_gate_pass_number_today() TO anon, authenticated;