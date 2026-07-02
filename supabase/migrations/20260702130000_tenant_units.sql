-- Multi-unit tenants
--
-- A tenant may occupy more than one unit. Previously each tenant had a single
-- unit/floor pair on their profile (profiles.unit / profiles.floor). This adds
-- a tenant_units table so a tenant can register several units at onboarding and
-- pick which unit a work permit / gate pass is for.
--
-- Backward compatibility: profiles.unit / profiles.floor are kept as the
-- tenant's PRIMARY unit (the first one). Work permits and gate passes continue
-- to store unit/floor as plain text on the record — the selector just sources
-- those values from the tenant's registered units instead of free typing.

CREATE TABLE IF NOT EXISTS public.tenant_units (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit       text NOT NULL,
  floor      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (tenant, unit, floor). Enables idempotent onboarding inserts.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_units_unique
  ON public.tenant_units (tenant_id, unit, floor);
CREATE INDEX IF NOT EXISTS idx_tenant_units_tenant
  ON public.tenant_units (tenant_id);

ALTER TABLE public.tenant_units ENABLE ROW LEVEL SECURITY;

-- Tenants read + manage their own units.
DROP POLICY IF EXISTS "Tenants manage own units" ON public.tenant_units;
CREATE POLICY "Tenants manage own units"
ON public.tenant_units
FOR ALL
TO authenticated
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

-- Admins read + manage every tenant's units (onboarding review, corrections).
DROP POLICY IF EXISTS "Admins manage all units" ON public.tenant_units;
CREATE POLICY "Admins manage all units"
ON public.tenant_units
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Backfill existing single-unit tenants into the new table.
INSERT INTO public.tenant_units (tenant_id, unit, floor)
SELECT id, TRIM(unit), COALESCE(NULLIF(TRIM(floor), ''), '')
FROM public.profiles
WHERE unit IS NOT NULL AND TRIM(unit) <> ''
ON CONFLICT (tenant_id, unit, floor) DO NOTHING;

-- Extend the signup trigger to also populate tenant_units from a `units`
-- JSON array in the auth metadata (falls back to the single unit/floor when
-- the array isn't supplied). The rest of the function is unchanged.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  initial_status     text;
  v_phone            text;
  v_company          text;
  v_unit             text;
  v_floor            text;
  tenant_role_id     uuid;
  signup_source      text;
BEGIN
  signup_source := NEW.raw_user_meta_data->>'signup_source';
  IF signup_source = 'admin_created' OR NEW.raw_user_meta_data->>'admin_created' = 'true' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  v_phone   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone',        '')), '');
  v_company := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');
  v_unit    := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'unit',         '')), '');
  v_floor   := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'floor',        '')), '');

  INSERT INTO public.profiles (
    id, email, full_name, phone, company_name, unit, floor,
    account_status, account_approved_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_phone,
    v_company,
    v_unit,
    v_floor,
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  IF signup_source <> 'admin_created' AND COALESCE(NEW.raw_user_meta_data->>'admin_created', '') <> 'true' THEN
    SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;

    IF tenant_role_id IS NULL THEN
      RAISE WARNING 'handle_new_user: tenant role missing from public.roles; user % has no role assigned', NEW.id;
    ELSE
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, tenant_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  END IF;

  -- Register the tenant's units. Prefer the `units` array; fall back to the
  -- single unit/floor pair. Guarded so a malformed array never blocks signup.
  BEGIN
    IF NEW.raw_user_meta_data ? 'units'
       AND jsonb_typeof(NEW.raw_user_meta_data->'units') = 'array' THEN
      INSERT INTO public.tenant_units (tenant_id, unit, floor)
      SELECT NEW.id,
             NULLIF(TRIM(elem->>'unit'), ''),
             COALESCE(NULLIF(TRIM(elem->>'floor'), ''), '')
      FROM jsonb_array_elements(NEW.raw_user_meta_data->'units') AS elem
      WHERE NULLIF(TRIM(elem->>'unit'), '') IS NOT NULL
      ON CONFLICT (tenant_id, unit, floor) DO NOTHING;
    ELSIF v_unit IS NOT NULL THEN
      INSERT INTO public.tenant_units (tenant_id, unit, floor)
      VALUES (NEW.id, v_unit, COALESCE(v_floor, ''))
      ON CONFLICT (tenant_id, unit, floor) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: failed to seed tenant_units for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
