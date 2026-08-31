CREATE TABLE IF NOT EXISTS public.sla_settings (
  id boolean PRIMARY KEY DEFAULT true,
  clock_basis text NOT NULL DEFAULT 'calendar',
  business_start time NOT NULL DEFAULT '08:00',
  business_end time NOT NULL DEFAULT '17:00',
  working_days int[] NOT NULL DEFAULT '{0,1,2,3,4}',
  timezone text NOT NULL DEFAULT 'Asia/Kuwait',
  default_sla_hours numeric NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT sla_settings_singleton CHECK (id = true),
  CONSTRAINT sla_settings_clock_basis CHECK (clock_basis IN ('calendar','business')),
  CONSTRAINT sla_settings_hours_pos CHECK (default_sla_hours > 0)
);
INSERT INTO public.sla_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type_id uuid NOT NULL REFERENCES public.work_types(id) ON DELETE CASCADE,
  urgency text NOT NULL DEFAULT 'normal',
  hours numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sla_policies_urgency CHECK (urgency IN ('normal','urgent')),
  CONSTRAINT sla_policies_hours CHECK (hours > 0),
  CONSTRAINT sla_policies_uq UNIQUE (work_type_id, urgency)
);

CREATE TABLE IF NOT EXISTS public.sla_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_holidays TO authenticated;
GRANT ALL ON public.sla_settings TO service_role;
GRANT ALL ON public.sla_policies TO service_role;
GRANT ALL ON public.sla_holidays TO service_role;

ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_holidays ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sla_settings','sla_policies','sla_holidays'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_read',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t||'_write', t);
  END LOOP;
END$$;

CREATE OR REPLACE FUNCTION public.compute_sla_deadline(_work_type_id uuid, _urgency text, _from timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s public.sla_settings; _hours numeric; _tz text;
  _remaining double precision; _cur timestamp; _day date; _dow int;
  _win_start timestamp; _win_end timestamp; _avail double precision;
BEGIN
  SELECT * INTO s FROM public.sla_settings WHERE id = true;
  IF NOT FOUND THEN RETURN _from + interval '24 hours'; END IF;
  _urgency := COALESCE(NULLIF(_urgency, ''), 'normal');
  IF _urgency NOT IN ('normal','urgent') THEN _urgency := 'normal'; END IF;
  _hours := NULL;
  IF _work_type_id IS NOT NULL THEN
    SELECT hours INTO _hours FROM public.sla_policies WHERE work_type_id = _work_type_id AND urgency = _urgency;
  END IF;
  _hours := COALESCE(_hours, s.default_sla_hours);
  IF _hours IS NULL OR _hours <= 0 THEN _hours := 24; END IF;
  IF s.clock_basis <> 'business' THEN RETURN _from + make_interval(secs => _hours * 3600); END IF;
  _tz := COALESCE(s.timezone, 'Asia/Kuwait');
  IF EXTRACT(EPOCH FROM (s.business_end - s.business_start)) <= 0 OR array_length(s.working_days, 1) IS NULL THEN
    RETURN _from + make_interval(secs => _hours * 3600);
  END IF;
  _remaining := _hours * 3600;
  _cur := (_from AT TIME ZONE _tz);
  FOR i IN 1..3660 LOOP
    _day := _cur::date; _dow := EXTRACT(DOW FROM _day)::int;
    IF (_dow = ANY (s.working_days)) AND NOT EXISTS (SELECT 1 FROM public.sla_holidays h WHERE h.holiday_date = _day) THEN
      _win_start := _day + s.business_start; _win_end := _day + s.business_end;
      IF _cur < _win_start THEN _cur := _win_start; END IF;
      IF _cur < _win_end THEN
        _avail := EXTRACT(EPOCH FROM (_win_end - _cur));
        IF _remaining <= _avail THEN RETURN (_cur + make_interval(secs => _remaining)) AT TIME ZONE _tz; END IF;
        _remaining := _remaining - _avail;
      END IF;
    END IF;
    _cur := (_day + 1)::timestamp;
  END LOOP;
  RETURN _from + make_interval(secs => _hours * 3600);
END; $$;
GRANT EXECUTE ON FUNCTION public.compute_sla_deadline(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_sla_deadline(uuid, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.set_work_permit_sla_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sla_deadline := public.compute_sla_deadline(NEW.work_type_id, NEW.urgency, COALESCE(NEW.created_at, now()));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.work_type_id IS DISTINCT FROM OLD.work_type_id AND NEW.status NOT IN ('approved','closed','rejected','cancelled') THEN
      NEW.sla_deadline := public.compute_sla_deadline(NEW.work_type_id, NEW.urgency, COALESCE(NEW.created_at, now()));
      NEW.sla_breached := false;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_work_permit_sla_deadline_ins ON public.work_permits;
CREATE TRIGGER trg_work_permit_sla_deadline_ins BEFORE INSERT ON public.work_permits FOR EACH ROW EXECUTE FUNCTION public.set_work_permit_sla_deadline();
DROP TRIGGER IF EXISTS trg_work_permit_sla_deadline_upd ON public.work_permits;
CREATE TRIGGER trg_work_permit_sla_deadline_upd BEFORE UPDATE ON public.work_permits FOR EACH ROW EXECUTE FUNCTION public.set_work_permit_sla_deadline();