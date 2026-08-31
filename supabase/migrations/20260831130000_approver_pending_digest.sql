-- =============================================================================
-- approver_pending_digest()
--
-- Feeds the daily "you have permits awaiting your approval" reminder
-- (daily-approver-reminder edge function). Returns one row per
-- (currently-active approver, permit) pair across ALL in-flight permits, so
-- the edge function can group by approver and email each of them a digest of
-- everything sitting with them right now.
--
-- "Currently active approver" reuses permit_active_approvers (the same view the
-- inbox uses): a permit appears for a role only when that role is the next to
-- act, and role membership (user_roles) naturally includes active delegates.
--
-- SECURITY DEFINER so the scheduled/service context sees every permit and every
-- role holder regardless of the caller's RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approver_pending_digest()
RETURNS TABLE (
  approver_id     uuid,
  email           text,
  full_name       text,
  permit_id       uuid,
  permit_no       text,
  status          text,
  role_label      text,
  requester_name  text,
  contractor_name text,
  work_location   text,
  sla_deadline    timestamptz,
  sla_breached    boolean,
  created_at      timestamptz,
  urgency         text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT
    ur.user_id                         AS approver_id,
    p.email                            AS email,
    p.full_name                        AS full_name,
    paa.permit_id                      AS permit_id,
    paa.permit_no                      AS permit_no,
    paa.permit_status                  AS status,
    COALESCE(r.label, paa.role_name)   AS role_label,
    paa.requester_name                 AS requester_name,
    wp.contractor_name                 AS contractor_name,
    wp.work_location                   AS work_location,
    paa.sla_deadline                   AS sla_deadline,
    COALESCE(wp.sla_breached, false)   AS sla_breached,
    paa.permit_created_at              AS created_at,
    paa.urgency                        AS urgency
  FROM public.permit_active_approvers paa
  JOIN public.user_roles ur ON ur.role_id = paa.role_id
  JOIN public.profiles   p  ON p.id = ur.user_id
  LEFT JOIN public.roles r  ON r.id = paa.role_id
  LEFT JOIN public.work_permits wp ON wp.id = paa.permit_id
  WHERE p.email IS NOT NULL AND p.email <> '';
$$;

GRANT EXECUTE ON FUNCTION public.approver_pending_digest() TO authenticated;
