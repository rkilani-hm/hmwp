-- =============================================================================
-- Foundation: Departments + Reviewer/Approver actor flag
--   spec: specs/departments-and-reviewer-flag.md
-- =============================================================================
-- Two NET-NEW structural dimensions that sit ALONGSIDE the existing role system
-- (roles still drive the workflow — unchanged):
--   * departments: each internal user assigned to at most one department
--     (tenants none). Used later to gate confidential comment visibility.
--   * profiles.actor_type (approver|reviewer): a COSMETIC label only — a reviewer
--     has identical workflow power; only the displayed verb changes.
-- =============================================================================

BEGIN;

-- 1. departments ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read departments (needed for pickers); only admins
-- may write. Mirrors the existing roles-table policy pattern.
DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
CREATE POLICY "Authenticated can view departments" ON public.departments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. profiles.department_id (single dept per user; tenants stay NULL) ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3. profiles.actor_type (approver|reviewer; default approver = no behaviour change)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'approver';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_actor_type_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_actor_type_check CHECK (actor_type IN ('approver','reviewer'));
  END IF;
END $$;

-- 4. get_user_department helper (SECURITY DEFINER so the downstream confidential-
--    comment feature can read a user's dept without tripping profiles RLS).
CREATE OR REPLACE FUNCTION public.get_user_department(p_user uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT department_id FROM public.profiles WHERE id = p_user;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_department(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
