-- =============================================================================
-- Three-tier comment visibility (confidential / internal / public)
--   spec: specs/comment-visibility-tiers.md   (depends on departments foundation)
-- =============================================================================
-- Replaces the single permit_approvals.comments blob with a proper comment model
-- whose visibility is enforced SERVER-SIDE via RLS — a user can never RETRIEVE a
-- comment they're not allowed to see (not merely hidden in the UI).
--   confidential -> only the author's department (snapshot at write time)
--   internal     -> all non-tenant staff
--   public       -> everyone, incl. tenants
-- Product decisions (defaults): admins see all; tenants may post PUBLIC only;
-- PDF shows public comments only; Work Permits this pass (gate passes later).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.permit_comments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id            uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  approval_id          uuid REFERENCES public.permit_approvals(id) ON DELETE SET NULL,
  author_id            uuid NOT NULL,
  author_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  tier                 text NOT NULL DEFAULT 'internal' CHECK (tier IN ('confidential','internal','public')),
  body                 text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permit_comments_permit    ON public.permit_comments(permit_id);
CREATE INDEX IF NOT EXISTS idx_permit_comments_dept_tier ON public.permit_comments(author_department_id, tier);

ALTER TABLE public.permit_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.permit_comments TO authenticated;

-- Snapshot the author's department AT WRITE TIME so later department changes
-- don't retroactively expose/hide a confidential comment (spec R3a / E5).
CREATE OR REPLACE FUNCTION public.permit_comments_set_dept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.author_id := COALESCE(NEW.author_id, auth.uid());
  NEW.author_department_id := public.get_user_department(NEW.author_id);
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_permit_comments_dept ON public.permit_comments;
CREATE TRIGGER trg_permit_comments_dept BEFORE INSERT ON public.permit_comments
  FOR EACH ROW EXECUTE FUNCTION public.permit_comments_set_dept();

-- READ: tier visibility (the core requirement, R3).
DROP POLICY IF EXISTS "read comments by tier" ON public.permit_comments;
CREATE POLICY "read comments by tier" ON public.permit_comments FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR tier = 'public'
  OR (tier = 'internal'     AND public.is_non_tenant_staff(auth.uid()))
  OR (tier = 'confidential' AND author_department_id IS NOT NULL
                            AND public.get_user_department(auth.uid()) = author_department_id)
);

-- WRITE: author is self; tenants public-only; confidential needs a department (R4).
DROP POLICY IF EXISTS "insert own comment by tier" ON public.permit_comments;
CREATE POLICY "insert own comment by tier" ON public.permit_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (NOT public.is_non_tenant_staff(auth.uid()) AND tier = 'public')
    OR (public.is_non_tenant_staff(auth.uid()) AND (
          tier IN ('public','internal')
          OR (tier = 'confidential' AND public.get_user_department(auth.uid()) IS NOT NULL)))
  )
);

-- DELETE: author or admin (comments are otherwise immutable).
DROP POLICY IF EXISTS "delete own comment or admin" ON public.permit_comments;
CREATE POLICY "delete own comment or admin" ON public.permit_comments FOR DELETE TO authenticated
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing populated permit_approvals.comments -> tier='internal'
-- (author = the step's approver if known). The permit_approvals.comments column
-- is KEPT for backward reads; new comments go to permit_comments only.
INSERT INTO public.permit_comments (permit_id, approval_id, author_id, tier, body, created_at)
SELECT pa.permit_id, pa.id,
       COALESCE(pa.approver_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
       'internal', pa.comments, COALESCE(pa.approved_at, now())
FROM public.permit_approvals pa
WHERE pa.comments IS NOT NULL AND btrim(pa.comments) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.permit_comments pc WHERE pc.approval_id = pa.id);

COMMIT;

NOTIFY pgrst, 'reload schema';
