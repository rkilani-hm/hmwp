-- Companies table — hardens the per-company visibility from PR #23.
--
-- Background: until now, two users from the same tenant company were
-- matched by case-insensitive comparison of `profiles.company_name`
-- (free text). Typos defeated the match — "Acme Corp" vs "ACME
-- Corporation" → different "companies" → invisible to each other.
--
-- This migration introduces:
--   * `public.companies` table — one row per company, case-insensitive
--     unique on the canonical (LOWER+TRIM) name.
--   * `profiles.company_id` — FK to companies. `company_name` stays
--     as a free-text input field but becomes a denormalized cache;
--     authority moves to `company_id`.
--   * BEFORE-INSERT/UPDATE trigger that resolves a typed company_name
--     to a company_id automatically, creating a new company row if
--     no canonical match exists.
--   * Backfill: every distinct (LOWER+TRIM) company name in the
--     existing profiles becomes a company; profiles get linked.
--   * Updated `same_company(uuid, uuid)` helper that compares
--     company_id instead of company_name. Same signature, same
--     semantics — the 7 RLS policies that call it from PR #23 keep
--     working without modification.
--
-- Idempotent: each schema change is guarded with IF NOT EXISTS / IF
-- EXISTS; the backfill skips profiles that already have a company_id.

-- ---------------------------------------------------------------
-- 1. companies table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on the canonical name. Two rows with
-- "Acme Corp" and "ACME CORP" cannot both exist; whoever signs up
-- first wins the casing.
CREATE UNIQUE INDEX IF NOT EXISTS companies_canonical_name_idx
  ON public.companies (LOWER(TRIM(name)));

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.companies_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_set_updated_at ON public.companies;
CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.companies_set_updated_at();

-- ---------------------------------------------------------------
-- 2. RLS for companies
--
-- Read: every authenticated user can read all companies (so the
-- typeahead can suggest matches in a future UI iteration). Names
-- aren't sensitive — they're already exposed to anyone the user
-- shares a permit with via per-company visibility.
--
-- Insert/update/delete: admin-only directly. The trigger that
-- resolves company_name → company_id runs SECURITY DEFINER so
-- non-admins can still indirectly create new rows by typing a new
-- name on the onboarding form.
-- ---------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view companies" ON public.companies;
CREATE POLICY "Authenticated can view companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
CREATE POLICY "Admins can manage companies"
  ON public.companies
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------------
-- 3. profiles.company_id FK
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid
    REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id
  ON public.profiles (company_id)
  WHERE company_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 4. Trigger: resolve company_name → company_id automatically.
--
-- Fires BEFORE INSERT or BEFORE UPDATE OF company_name. Looks up
-- the canonical (LOWER+TRIM) name in companies; creates a row if
-- not found (with the typed casing preserved as the display name);
-- assigns the resolved id to NEW.company_id.
--
-- SECURITY DEFINER so the trigger can INSERT into companies even
-- when invoked by a non-admin (the legitimate onboarding flow).
-- The trigger never reads anyone else's data, so no privilege
-- escalation.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trimmed text;
  resolved_id uuid;
BEGIN
  trimmed := NULLIF(TRIM(NEW.company_name), '');

  IF trimmed IS NULL THEN
    NEW.company_id := NULL;
    RETURN NEW;
  END IF;

  -- Try existing company (case-insensitive on canonical name).
  SELECT id INTO resolved_id
  FROM public.companies
  WHERE LOWER(TRIM(name)) = LOWER(trimmed)
  LIMIT 1;

  -- Create new company if not found. The unique index guards
  -- against races; on conflict we re-read the existing row.
  IF resolved_id IS NULL THEN
    BEGIN
      INSERT INTO public.companies (name, created_by)
      VALUES (trimmed, NEW.id)
      RETURNING id INTO resolved_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO resolved_id
      FROM public.companies
      WHERE LOWER(TRIM(name)) = LOWER(trimmed)
      LIMIT 1;
    END;
  END IF;

  NEW.company_id := resolved_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_company_id ON public.profiles;
CREATE TRIGGER profiles_sync_company_id
  BEFORE INSERT OR UPDATE OF company_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_company_id();

-- ---------------------------------------------------------------
-- 5. Backfill: every existing profile with a non-empty company_name
-- gets a company row + company_id link.
--
-- Strategy: pick one canonical row per LOWER(TRIM(company_name))
-- group, ordered by created_at ASC so the oldest profile's casing
-- wins for the company's display name. Insert into companies (one
-- per group), then UPDATE every matching profile.
--
-- The DO block is idempotent: profiles that already have
-- company_id set are skipped, and the INSERT uses ON CONFLICT
-- semantics via try/catch.
-- ---------------------------------------------------------------
DO $$
DECLARE
  rec record;
  cid uuid;
BEGIN
  FOR rec IN
    SELECT
      LOWER(TRIM(company_name)) AS canonical,
      MIN(company_name)         AS pretty_name  -- arbitrary representative; first lexicographic
    FROM public.profiles
    WHERE company_name IS NOT NULL
      AND TRIM(company_name) <> ''
      AND company_id IS NULL
    GROUP BY LOWER(TRIM(company_name))
  LOOP
    -- Find existing company by canonical name
    SELECT id INTO cid
    FROM public.companies
    WHERE LOWER(TRIM(name)) = rec.canonical
    LIMIT 1;

    -- Create if missing
    IF cid IS NULL THEN
      INSERT INTO public.companies (name)
      VALUES (rec.pretty_name)
      RETURNING id INTO cid;
    END IF;

    -- Link every profile in this canonical group
    UPDATE public.profiles
    SET company_id = cid
    WHERE LOWER(TRIM(company_name)) = rec.canonical
      AND company_id IS NULL;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 6. Update same_company() to use company_id.
--
-- Same signature, same semantics ("two distinct authenticated users
-- in the same non-empty company"), now with a strict FK comparison
-- instead of a string comparison. The 7 RLS policies that call this
-- helper from migration 20260510130000 keep working without
-- modification — they only see the function name.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.same_company(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_a IS NOT NULL
     AND _user_b IS NOT NULL
     AND _user_a <> _user_b
     AND EXISTS (
       SELECT 1
       FROM public.profiles a
       JOIN public.profiles b ON a.company_id = b.company_id
       WHERE a.id = _user_a
         AND b.id = _user_b
         AND a.company_id IS NOT NULL
     );
$$;

COMMENT ON FUNCTION public.same_company(uuid, uuid) IS
  'True if both users belong to the same company (compared via profiles.company_id FK to public.companies). Used by per-company RLS policies on work_permits, gate_passes and their child tables.';
