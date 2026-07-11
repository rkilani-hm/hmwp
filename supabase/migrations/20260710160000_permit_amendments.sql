-- Phase 3: post-approval amendments (work permits)
--
-- After a permit is fully approved, two changes are often needed on site:
--   * extend the schedule (another day / more hours), or
--   * add extra worker Civil IDs.
-- Each is captured as an amendment requiring a single Head of Health, Safety &
-- Security (or admin) sign-off. On approval the change is applied, the approved
-- PDF is regenerated, and it is re-emailed to the tenant + helpdesk (+ creator).

CREATE TABLE IF NOT EXISTS public.permit_amendments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id         uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  amendment_type    text NOT NULL CHECK (amendment_type IN ('extend', 'add_ids')),
  reason            text,
  -- extend payload
  old_date_to       date,
  old_time_to       text,
  new_date_to       date,
  new_time_to       text,
  -- add_ids payload (the actual files are added to permit_attachments directly)
  added_id_count    integer,
  requested_by      uuid,
  requested_by_name text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by       uuid,
  resolved_by_name  text,
  resolved_at       timestamptz,
  resolution_comment text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permit_amendments_permit ON public.permit_amendments (permit_id);
CREATE INDEX IF NOT EXISTS idx_permit_amendments_status ON public.permit_amendments (status);

ALTER TABLE public.permit_amendments ENABLE ROW LEVEL SECURITY;

-- Read: the permit owner, or any internal staff (approvers see the queue).
DROP POLICY IF EXISTS "amendments_select" ON public.permit_amendments;
CREATE POLICY "amendments_select" ON public.permit_amendments FOR SELECT TO authenticated
USING (
  is_non_tenant_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.work_permits wp WHERE wp.id = permit_id AND wp.requester_id = auth.uid())
);

-- Request: the permit owner or internal staff may raise an amendment.
DROP POLICY IF EXISTS "amendments_insert" ON public.permit_amendments;
CREATE POLICY "amendments_insert" ON public.permit_amendments FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    is_non_tenant_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.work_permits wp WHERE wp.id = permit_id AND wp.requester_id = auth.uid())
  )
);
-- Resolution is done server-side by the resolve-permit-amendment function
-- (service role), so no UPDATE policy is granted to end users.

-- Whether the caller may APPROVE amendments: admin or Head of H&S.
CREATE OR REPLACE FUNCTION public.can_approve_amendment(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user
      AND (r.name = 'admin' OR r.name ILIKE '%health_safety%' OR r.name ILIKE '%health%safety%')
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_approve_amendment(uuid) TO authenticated;
