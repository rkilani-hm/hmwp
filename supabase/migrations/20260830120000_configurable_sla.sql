-- =============================================================================
-- Configurable SLA
--
-- Replaces the hard-coded SLA windows (24h in the app form, 48h/4h in the
-- public-submission edge function) with an admin-configurable policy:
--   * a per (work_type x urgency) matrix of SLA hours, and
--   * a global clock basis that is either plain CALENDAR hours or BUSINESS
--     hours (skipping non-working weekdays and holidays).
--
-- A single function, compute_sla_deadline(), is the one place the deadline is
-- derived, and a BEFORE INSERT/UPDATE trigger on work_permits makes it the sole
-- source of truth for sla_deadline — so every entry path (app form, resubmit,
-- public/internal QR submission) stays consistent automatically.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Global settings (singleton row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_settings (
  id                boolean     PRIMARY KEY DEFAULT true,
  clock_basis       text        NOT NULL DEFAULT 'calendar',
  business_start    time        NOT NULL DEFAULT '08:00',
  business_end      time        NOT NULL DEFAULT '17:00',
  -- Day-of-week numbers Postgres uses: 0=Sunday .. 6=Saturday.
  -- Default {0,1,2,3,4} = Sunday–Thursday (Kuwait work week).
  working_days      int[]       NOT NULL DEFAULT '{0,1,2,3,4}',
  timezone          text        NOT NULL DEFAULT 'Asia/Kuwait',
  default_sla_hours numeric     NOT NULL DEFAULT 24,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  CONSTRAINT sla_settings_singleton   CHECK (id = true),
  CONSTRAINT sla_settings_clock_basis CHECK (clock_basis IN ('calendar','business')),
  CONSTRAINT sla_settings_hours_pos   CHECK (default_sla_hours > 0)
);

INSERT INTO public.sla_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Per (work_type x urgency) SLA matrix. A missing row => default_sla_hours.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type_id uuid        NOT NULL REFERENCES public.work_types(id) ON DELETE CASCADE,
  urgency      text        NOT NULL DEFAULT 'normal',
  hours        numeric     NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sla_policies_urgency CHECK (urgency IN ('normal','urgent')),
  CONSTRAINT sla_policies_hours   CHECK (hours > 0),
  CONSTRAINT sla_policies_uq      UNIQUE (work_type_id, urgency)
);

-- ---------------------------------------------------------------------------
-- 3. Holidays the business-hours clock skips.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name         text
);

-- ---------------------------------------------------------------------------
-- 4. RLS: everyone signed in can READ the config (the app needs it and it is
--    not sensitive); only admins can change it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_holidays ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sla_settings','sla_policies','sla_holidays'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_read',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t||'_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))',
      t||'_write', t);
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- 5. The one place a deadline is computed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_sla_deadline(
  _work_type_id uuid,
  _urgency      text,
  _from         timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s          public.sla_settings;
  _hours     numeric;
  _tz        text;
  _remaining double precision;  -- seconds of business time still to place
  _cur       timestamp;         -- local wall-clock cursor (no tz)
  _day       date;
  _dow       int;
  _win_start timestamp;
  _win_end   timestamp;
  _avail     double precision;
BEGIN
  SELECT * INTO s FROM public.sla_settings WHERE id = true;
  IF NOT FOUND THEN
    RETURN _from + interval '24 hours';
  END IF;

  _urgency := COALESCE(NULLIF(_urgency, ''), 'normal');
  IF _urgency NOT IN ('normal','urgent') THEN _urgency := 'normal'; END IF;

  -- Resolve hours: exact (type,urgency) policy wins; otherwise the global default.
  _hours := NULL;
  IF _work_type_id IS NOT NULL THEN
    SELECT hours INTO _hours FROM public.sla_policies
      WHERE work_type_id = _work_type_id AND urgency = _urgency;
  END IF;
  _hours := COALESCE(_hours, s.default_sla_hours);
  IF _hours IS NULL OR _hours <= 0 THEN _hours := 24; END IF;

  -- Calendar mode: straight wall-clock addition.
  IF s.clock_basis <> 'business' THEN
    RETURN _from + make_interval(secs => _hours * 3600);
  END IF;

  -- Business mode.
  _tz := COALESCE(s.timezone, 'Asia/Kuwait');
  IF EXTRACT(EPOCH FROM (s.business_end - s.business_start)) <= 0
     OR array_length(s.working_days, 1) IS NULL THEN
    -- Misconfigured window: degrade gracefully to calendar time.
    RETURN _from + make_interval(secs => _hours * 3600);
  END IF;

  _remaining := _hours * 3600;
  _cur := (_from AT TIME ZONE _tz);   -- interpret the instant as local wall clock

  -- Walk forward one day at a time, consuming the working window each day.
  -- Bounded so a pathological config can never loop forever (~10 years).
  FOR i IN 1..3660 LOOP
    _day := _cur::date;
    _dow := EXTRACT(DOW FROM _day)::int;
    IF (_dow = ANY (s.working_days))
       AND NOT EXISTS (SELECT 1 FROM public.sla_holidays h WHERE h.holiday_date = _day) THEN
      _win_start := _day + s.business_start;
      _win_end   := _day + s.business_end;
      IF _cur < _win_start THEN _cur := _win_start; END IF;
      IF _cur < _win_end THEN
        _avail := EXTRACT(EPOCH FROM (_win_end - _cur));
        IF _remaining <= _avail THEN
          -- Finishes within this day's window; convert local time back to tz.
          RETURN (_cur + make_interval(secs => _remaining)) AT TIME ZONE _tz;
        END IF;
        _remaining := _remaining - _avail;
      END IF;
    END IF;
    _cur := (_day + 1)::timestamp;  -- 00:00 next day
  END LOOP;

  RETURN _from + make_interval(secs => _hours * 3600);  -- safety fallback
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_sla_deadline(uuid, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Trigger: sla_deadline is derived, never trusted from the client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_work_permit_sla_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sla_deadline := public.compute_sla_deadline(
      NEW.work_type_id, NEW.urgency, COALESCE(NEW.created_at, now()));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Recompute when the work type is (re)assigned while the permit is still
    -- in flight — e.g. helpdesk classifies a public request after submission.
    IF NEW.work_type_id IS DISTINCT FROM OLD.work_type_id
       AND NEW.status NOT IN ('approved','closed','rejected','cancelled') THEN
      NEW.sla_deadline := public.compute_sla_deadline(
        NEW.work_type_id, NEW.urgency, COALESCE(NEW.created_at, now()));
      NEW.sla_breached := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_permit_sla_deadline_ins ON public.work_permits;
CREATE TRIGGER trg_work_permit_sla_deadline_ins
  BEFORE INSERT ON public.work_permits
  FOR EACH ROW EXECUTE FUNCTION public.set_work_permit_sla_deadline();

DROP TRIGGER IF EXISTS trg_work_permit_sla_deadline_upd ON public.work_permits;
CREATE TRIGGER trg_work_permit_sla_deadline_upd
  BEFORE UPDATE ON public.work_permits
  FOR EACH ROW EXECUTE FUNCTION public.set_work_permit_sla_deadline();
