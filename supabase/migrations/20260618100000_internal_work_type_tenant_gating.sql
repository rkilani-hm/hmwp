-- =============================================================================
-- Internal work types restricted to internal staff   spec: specs/internal-work-type-tenant-gating.md
-- =============================================================================
--
-- A work type is "internal" iff its workflow template's workflow_type = 'internal'
-- (live values: client | internal | gate_pass). Tenants (tenant-only users) must
-- not see or submit internal work types; internal staff are unaffected.
--
-- Decisions taken (per spec defaults):
--   * Gate passes: DEFERRED — no GP internal marker exists; GPs stay available to
--     all. This migration touches Work Permits only.
--   * work_permits.is_internal: DERIVED server-side from the work type's
--     workflow_type at insert (+ backfilled). ACCESS decisions key on
--     workflow_type via work_type_is_internal(), NOT on this boolean.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Predicate: is a work type internal? (ambiguous/missing template => false,
--    so we never accidentally hide everything; explicit 'internal' => true.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_type_is_internal(p_work_type_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT wtpl.workflow_type = 'internal'
       FROM public.work_types wt
       JOIN public.workflow_templates wtpl ON wtpl.id = wt.workflow_template_id
      WHERE wt.id = p_work_type_id),
    false);
$$;
GRANT EXECUTE ON FUNCTION public.work_type_is_internal(uuid) TO authenticated;

-- "tenant-only" = holds the tenant role and NO non-tenant role.
CREATE OR REPLACE FUNCTION public.is_tenant_only(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_tenant_user(p_user) AND NOT public.is_non_tenant_staff(p_user);
$$;
GRANT EXECUTE ON FUNCTION public.is_tenant_only(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Caller-appropriate work-type list (R1).  Tenant-only callers never see
--    internal work types; everyone else sees all. SECURITY DEFINER so the
--    workflow_type join is not blocked by RLS on workflow_templates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_work_types_for_caller()
RETURNS SETOF public.work_types
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT wt.*
  FROM public.work_types wt
  WHERE NOT (public.is_tenant_only(auth.uid()) AND public.work_type_is_internal(wt.id))
  ORDER BY wt.name;
$$;
GRANT EXECUTE ON FUNCTION public.list_work_types_for_caller() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Insert trigger: derive is_internal (R5) + reject tenant-only internal (R2).
--    Backend guard is independent of the UI so a crafted request can't bypass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_workpermit_internal_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_internal boolean;
BEGIN
  v_internal := public.work_type_is_internal(NEW.work_type_id);

  -- R5: keep the per-permit flag truthful regardless of what the client sent.
  NEW.is_internal := v_internal;

  -- R2: a tenant-only requester may not hold an internal-type permit.
  IF v_internal AND NEW.requester_id IS NOT NULL AND public.is_tenant_only(NEW.requester_id) THEN
    RAISE EXCEPTION 'Internal work types are not available to tenants'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workpermit_internal_guard ON public.work_permits;
CREATE TRIGGER workpermit_internal_guard
  BEFORE INSERT ON public.work_permits
  FOR EACH ROW EXECUTE FUNCTION public.tr_workpermit_internal_guard();

-- ---------------------------------------------------------------------------
-- 4. Backfill is_internal for existing rows from their work type's workflow_type.
-- ---------------------------------------------------------------------------
UPDATE public.work_permits wp
   SET is_internal = public.work_type_is_internal(wp.work_type_id)
 WHERE wp.is_internal IS DISTINCT FROM public.work_type_is_internal(wp.work_type_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
