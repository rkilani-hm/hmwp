-- Contractor registry (Phase 1)
--
-- Until now a permit/gate-pass stored the contractor only as free text
-- (work_permits.contractor_name / gate_passes.client_contractor_name). Tenants
-- change contractors often, and Al Hamra needs to see, reuse and (later) report
-- on contractors per tenant. This introduces contractors as first-class records
-- that tenants/staff pick or add when raising a permit — without giving
-- contractors any login (the tenant remains the accountable account holder).

CREATE TABLE IF NOT EXISTS public.contractors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  contact_person  text,
  phone           text,
  email           text,
  trade           text,          -- type of work / trade (optional)
  notes           text,
  created_by      uuid,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- One record per contractor company (case/space-insensitive), shared across tenants.
CREATE UNIQUE INDEX IF NOT EXISTS contractors_normalized_name_key ON public.contractors (normalized_name);

-- Which tenants use which contractors (each tenant's contractor "address book").
CREATE TABLE IF NOT EXISTS public.tenant_contractors (
  tenant_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  first_used_at timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  usage_count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, contractor_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_contractors_contractor ON public.tenant_contractors (contractor_id);

-- Link the actual records to the contractor (keeps existing free-text for PDFs / back-compat).
ALTER TABLE public.work_permits ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id);
ALTER TABLE public.gate_passes  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_contractors ENABLE ROW LEVEL SECURITY;

-- Contractors: internal staff/admin read all; a tenant reads contractors they
-- created or are linked to. Anyone authenticated may add a contractor.
DROP POLICY IF EXISTS "contractors_select" ON public.contractors;
CREATE POLICY "contractors_select" ON public.contractors FOR SELECT TO authenticated
USING (
  is_non_tenant_staff(auth.uid())
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tenant_contractors tc
             WHERE tc.contractor_id = contractors.id AND tc.tenant_id = auth.uid())
);
DROP POLICY IF EXISTS "contractors_insert" ON public.contractors;
CREATE POLICY "contractors_insert" ON public.contractors FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "contractors_update" ON public.contractors;
CREATE POLICY "contractors_update" ON public.contractors FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

-- Tenant↔contractor links: a tenant manages their own; staff/admin see all.
DROP POLICY IF EXISTS "tc_select" ON public.tenant_contractors;
CREATE POLICY "tc_select" ON public.tenant_contractors FOR SELECT TO authenticated
USING (tenant_id = auth.uid() OR is_non_tenant_staff(auth.uid()));
DROP POLICY IF EXISTS "tc_write" ON public.tenant_contractors;
CREATE POLICY "tc_write" ON public.tenant_contractors FOR ALL TO authenticated
USING (tenant_id = auth.uid() OR is_non_tenant_staff(auth.uid()))
WITH CHECK (tenant_id = auth.uid() OR is_non_tenant_staff(auth.uid()));

-- Find-or-create a contractor by name and link it to a tenant (default: caller).
-- Returns the contractor id. Enriches blank fields on an existing record and
-- bumps the tenant's usage counter. SECURITY DEFINER so dedup + linking work
-- regardless of the caller's direct RLS on these tables.
CREATE OR REPLACE FUNCTION public.upsert_contractor(
  p_name text,
  p_contact_person text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_trade text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid;
  v_norm text := lower(btrim(COALESCE(p_name, '')));
  v_tenant uuid := COALESCE(p_tenant_id, auth.uid());
BEGIN
  IF v_norm = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM public.contractors WHERE normalized_name = v_norm LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.contractors (name, contact_person, phone, email, trade, created_by)
    VALUES (btrim(p_name),
            NULLIF(btrim(COALESCE(p_contact_person, '')), ''),
            NULLIF(btrim(COALESCE(p_phone, '')), ''),
            NULLIF(btrim(COALESCE(p_email, '')), ''),
            NULLIF(btrim(COALESCE(p_trade, '')), ''),
            auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contractors SET
      contact_person = COALESCE(contact_person, NULLIF(btrim(COALESCE(p_contact_person, '')), '')),
      phone          = COALESCE(phone,          NULLIF(btrim(COALESCE(p_phone, '')), '')),
      email          = COALESCE(email,          NULLIF(btrim(COALESCE(p_email, '')), '')),
      trade          = COALESCE(trade,          NULLIF(btrim(COALESCE(p_trade, '')), '')),
      updated_at     = now()
    WHERE id = v_id;
  END IF;

  IF v_tenant IS NOT NULL THEN
    INSERT INTO public.tenant_contractors (tenant_id, contractor_id, usage_count, last_used_at)
    VALUES (v_tenant, v_id, 1, now())
    ON CONFLICT (tenant_id, contractor_id)
    DO UPDATE SET usage_count = public.tenant_contractors.usage_count + 1, last_used_at = now();
  END IF;

  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.upsert_contractor(text, text, text, text, text, uuid) TO authenticated;

-- Admin overview: every contractor with usage counts (staff/admin only).
CREATE OR REPLACE FUNCTION public.contractor_overview()
RETURNS TABLE(id uuid, name text, contact_person text, phone text, email text, trade text,
  tenant_count bigint, wp_count bigint, gp_count bigint, last_used timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.name, c.contact_person, c.phone, c.email, c.trade,
    (SELECT count(*) FROM public.tenant_contractors tc WHERE tc.contractor_id = c.id),
    (SELECT count(*) FROM public.work_permits wp WHERE wp.contractor_id = c.id),
    (SELECT count(*) FROM public.gate_passes gp WHERE gp.contractor_id = c.id),
    (SELECT max(tc.last_used_at) FROM public.tenant_contractors tc WHERE tc.contractor_id = c.id),
    c.created_at
  FROM public.contractors c
  WHERE public.is_non_tenant_staff(auth.uid())
  ORDER BY c.name;
$$;
GRANT EXECUTE ON FUNCTION public.contractor_overview() TO authenticated;

-- Which tenants use a given contractor (admin drill-down).
CREATE OR REPLACE FUNCTION public.contractor_tenants(p_contractor_id uuid)
RETURNS TABLE(tenant_id uuid, tenant_name text, company text, usage_count integer, last_used_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT tc.tenant_id, p.full_name, p.company_name, tc.usage_count, tc.last_used_at
  FROM public.tenant_contractors tc
  JOIN public.profiles p ON p.id = tc.tenant_id
  WHERE tc.contractor_id = p_contractor_id AND public.is_non_tenant_staff(auth.uid())
  ORDER BY tc.last_used_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.contractor_tenants(uuid) TO authenticated;
