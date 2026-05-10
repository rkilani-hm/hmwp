-- ============================================================
-- Migration 1: rename contractor role to tenant
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'contractor'
  ) THEN
    EXECUTE 'ALTER TYPE public.app_role RENAME VALUE ''contractor'' TO ''tenant''';
  END IF;
END $mig$;

UPDATE public.roles
SET name = 'tenant', label = 'Tenant',
    description = 'Default role for tenants who submit work permits and gate pass requests'
WHERE name = 'contractor';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  tenant_role_id uuid;
  initial_status text;
BEGIN
  IF NEW.raw_user_meta_data->>'admin_created' = 'true' THEN
    initial_status := 'approved';
  ELSE
    initial_status := 'pending';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, account_status, account_approved_at)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    initial_status,
    CASE WHEN initial_status = 'approved' THEN now() ELSE NULL END
  );

  SELECT id INTO tenant_role_id FROM public.roles WHERE name = 'tenant' LIMIT 1;
  IF tenant_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, tenant_role_id);
  END IF;
  RETURN NEW;
END;
$fn$;

-- ============================================================
-- Migration 2: per-company visibility (initial company_name-based)
-- ============================================================
CREATE OR REPLACE FUNCTION public.same_company(_user_a uuid, _user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT _user_a IS NOT NULL AND _user_b IS NOT NULL AND _user_a <> _user_b
    AND EXISTS (
      SELECT 1 FROM public.profiles a JOIN public.profiles b
        ON LOWER(TRIM(a.company_name)) = LOWER(TRIM(b.company_name))
      WHERE a.id = _user_a AND b.id = _user_b
        AND NULLIF(TRIM(a.company_name), '') IS NOT NULL
        AND NULLIF(TRIM(b.company_name), '') IS NOT NULL
    );
$fn$;

DROP POLICY IF EXISTS "Users can view own permits" ON public.work_permits;
DROP POLICY IF EXISTS "Users can view own or company permits" ON public.work_permits;
CREATE POLICY "Users can view own or company permits" ON public.work_permits
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.same_company(auth.uid(), requester_id));

DROP POLICY IF EXISTS "Users can view own gate passes" ON public.gate_passes;
DROP POLICY IF EXISTS "Users can view own or company gate passes" ON public.gate_passes;
CREATE POLICY "Users can view own or company gate passes" ON public.gate_passes
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.same_company(auth.uid(), requester_id));

DROP POLICY IF EXISTS "Requesters can view their permit approvals" ON public.permit_approvals;
DROP POLICY IF EXISTS "Requesters can view their or company permit approvals" ON public.permit_approvals;
CREATE POLICY "Requesters can view their or company permit approvals" ON public.permit_approvals
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.work_permits wp WHERE wp.id = permit_approvals.permit_id
    AND (wp.requester_id = auth.uid() OR public.same_company(auth.uid(), wp.requester_id))));

DROP POLICY IF EXISTS "Requesters can view their gate pass approvals" ON public.gate_pass_approvals;
DROP POLICY IF EXISTS "Requesters can view their or company gate pass approvals" ON public.gate_pass_approvals;
CREATE POLICY "Requesters can view their or company gate pass approvals" ON public.gate_pass_approvals
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.gate_passes gp WHERE gp.id = gate_pass_approvals.gate_pass_id
    AND (gp.requester_id = auth.uid() OR public.same_company(auth.uid(), gp.requester_id))));

DROP POLICY IF EXISTS "Users can view items of own gate passes" ON public.gate_pass_items;
DROP POLICY IF EXISTS "Users can view items of own or company gate passes" ON public.gate_pass_items;
CREATE POLICY "Users can view items of own or company gate passes" ON public.gate_pass_items
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.gate_passes gp WHERE gp.id = gate_pass_items.gate_pass_id
    AND (gp.requester_id = auth.uid() OR public.same_company(auth.uid(), gp.requester_id))));

DROP POLICY IF EXISTS "Users can view signature logs for own permits" ON public.signature_audit_logs;
DROP POLICY IF EXISTS "Users can view signature logs for own or company permits" ON public.signature_audit_logs;
CREATE POLICY "Users can view signature logs for own or company permits" ON public.signature_audit_logs
  FOR SELECT
  USING (permit_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.work_permits wp WHERE wp.id = signature_audit_logs.permit_id
      AND (wp.requester_id = auth.uid() OR public.same_company(auth.uid(), wp.requester_id))));

DROP POLICY IF EXISTS "Users can view signature logs for own gate passes" ON public.signature_audit_logs;
DROP POLICY IF EXISTS "Users can view signature logs for own or company gate passes" ON public.signature_audit_logs;
CREATE POLICY "Users can view signature logs for own or company gate passes" ON public.signature_audit_logs
  FOR SELECT
  USING (gate_pass_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gate_passes gp WHERE gp.id = signature_audit_logs.gate_pass_id
      AND (gp.requester_id = auth.uid() OR public.same_company(auth.uid(), gp.requester_id))));

-- ============================================================
-- Migration 3: pending approval queue
-- ============================================================
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='account_status') THEN
    ALTER TABLE public.profiles
      ADD COLUMN account_status text NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending','approved','rejected'));
  END IF;
END $mig$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_rejection_reason text,
  ADD COLUMN IF NOT EXISTS account_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.profiles
SET account_status = 'approved',
    account_approved_at = COALESCE(account_approved_at, created_at)
WHERE account_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profiles_account_status_pending
  ON public.profiles (account_status, created_at DESC)
  WHERE account_status = 'pending';

CREATE OR REPLACE FUNCTION public.current_user_account_status()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT account_status FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$fn$;

DROP POLICY IF EXISTS "Users can create permits" ON public.work_permits;
CREATE POLICY "Users can create permits" ON public.work_permits
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND public.current_user_account_status() = 'approved');

DROP POLICY IF EXISTS "Users can create gate passes" ON public.gate_passes;
CREATE POLICY "Users can create gate passes" ON public.gate_passes
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND public.current_user_account_status() = 'approved');

-- ============================================================
-- Migration 4: companies table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_canonical_name_idx
  ON public.companies (LOWER(TRIM(name)));

CREATE OR REPLACE FUNCTION public.companies_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS companies_set_updated_at ON public.companies;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_set_updated_at();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view companies" ON public.companies;
CREATE POLICY "Authenticated can view companies" ON public.companies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
CREATE POLICY "Admins can manage companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id
  ON public.profiles (company_id) WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE trimmed text; resolved_id uuid;
BEGIN
  trimmed := NULLIF(TRIM(NEW.company_name), '');
  IF trimmed IS NULL THEN NEW.company_id := NULL; RETURN NEW; END IF;
  SELECT id INTO resolved_id FROM public.companies
    WHERE LOWER(TRIM(name)) = LOWER(trimmed) LIMIT 1;
  IF resolved_id IS NULL THEN
    BEGIN
      INSERT INTO public.companies (name, created_by)
        VALUES (trimmed, NEW.id) RETURNING id INTO resolved_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO resolved_id FROM public.companies
        WHERE LOWER(TRIM(name)) = LOWER(trimmed) LIMIT 1;
    END;
  END IF;
  NEW.company_id := resolved_id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_sync_company_id ON public.profiles;
CREATE TRIGGER profiles_sync_company_id
  BEFORE INSERT OR UPDATE OF company_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_company_id();

DO $mig$
DECLARE rec record; cid uuid;
BEGIN
  FOR rec IN
    SELECT LOWER(TRIM(company_name)) AS canonical, MIN(company_name) AS pretty_name
    FROM public.profiles
    WHERE company_name IS NOT NULL AND TRIM(company_name) <> '' AND company_id IS NULL
    GROUP BY LOWER(TRIM(company_name))
  LOOP
    SELECT id INTO cid FROM public.companies WHERE LOWER(TRIM(name)) = rec.canonical LIMIT 1;
    IF cid IS NULL THEN
      INSERT INTO public.companies (name) VALUES (rec.pretty_name) RETURNING id INTO cid;
    END IF;
    UPDATE public.profiles SET company_id = cid
      WHERE LOWER(TRIM(company_name)) = rec.canonical AND company_id IS NULL;
  END LOOP;
END $mig$;

CREATE OR REPLACE FUNCTION public.same_company(_user_a uuid, _user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT _user_a IS NOT NULL AND _user_b IS NOT NULL AND _user_a <> _user_b
    AND EXISTS (
      SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.company_id = b.company_id
      WHERE a.id = _user_a AND b.id = _user_b AND a.company_id IS NOT NULL
    );
$fn$;

NOTIFY pgrst, 'reload schema';
