-- =============================================================================
-- Three-tier comment visibility for GATE PASSES (parity with permit_comments)
--   spec: specs/comment-visibility-tiers.md (R8 — gate pass extension)
-- =============================================================================
-- Mirror of public.permit_comments keyed on gate_pass_id. Same server-side tier
-- RLS: public→everyone, internal→non-tenant staff, confidential→same department
-- as the author (snapshot at write time). Tenants may post public only;
-- confidential requires a department. Validated live with a 3-persona read
-- simulation, rolled back.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.gate_pass_comments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_pass_id         uuid NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
  approval_id          uuid REFERENCES public.gate_pass_approvals(id) ON DELETE SET NULL,
  author_id            uuid NOT NULL,
  author_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  tier                 text NOT NULL DEFAULT 'internal' CHECK (tier IN ('confidential','internal','public')),
  body                 text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gate_pass_comments_pass      ON public.gate_pass_comments(gate_pass_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_comments_dept_tier ON public.gate_pass_comments(author_department_id, tier);

ALTER TABLE public.gate_pass_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.gate_pass_comments TO authenticated;

CREATE OR REPLACE FUNCTION public.gate_pass_comments_set_dept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.author_id := COALESCE(NEW.author_id, auth.uid());
  NEW.author_department_id := public.get_user_department(NEW.author_id);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_gate_pass_comments_dept ON public.gate_pass_comments;
CREATE TRIGGER trg_gate_pass_comments_dept BEFORE INSERT ON public.gate_pass_comments
  FOR EACH ROW EXECUTE FUNCTION public.gate_pass_comments_set_dept();

DROP POLICY IF EXISTS "read gp comments by tier" ON public.gate_pass_comments;
CREATE POLICY "read gp comments by tier" ON public.gate_pass_comments FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR tier = 'public'
  OR (tier = 'internal'     AND public.is_non_tenant_staff(auth.uid()))
  OR (tier = 'confidential' AND author_department_id IS NOT NULL
                            AND public.get_user_department(auth.uid()) = author_department_id)
);

DROP POLICY IF EXISTS "insert own gp comment by tier" ON public.gate_pass_comments;
CREATE POLICY "insert own gp comment by tier" ON public.gate_pass_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (NOT public.is_non_tenant_staff(auth.uid()) AND tier = 'public')
    OR (public.is_non_tenant_staff(auth.uid()) AND (
          tier IN ('public','internal')
          OR (tier = 'confidential' AND public.get_user_department(auth.uid()) IS NOT NULL)))
  )
);

DROP POLICY IF EXISTS "delete own gp comment or admin" ON public.gate_pass_comments;
CREATE POLICY "delete own gp comment or admin" ON public.gate_pass_comments FOR DELETE TO authenticated
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

COMMIT;

NOTIFY pgrst, 'reload schema';
