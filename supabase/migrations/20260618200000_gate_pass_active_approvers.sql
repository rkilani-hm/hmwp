-- =============================================================================
-- Gate Pass active-approver resolution (parity with Work Permit inbox)
--   spec: specs/gate-pass-active-approver-resolution.md
-- =============================================================================
--
-- WP resolves "who must act now" via permit_active_approvers (current-step view)
-- + get_my_inbox_permits() (SECURITY DEFINER, delegation/forward-aware). GP had
-- neither — its approver list matched gate_passes.status='pending_<role>' on the
-- client. This adds the WP-style pair for GP.
--
-- gate_pass_approvals is currently EMPTY (the modern table isn't populated), so
-- the current-step role is derived from gate_passes.status (`pending_<role_name>`)
-- joined to roles — which already carries the real custom role names (e.g.
-- pending_coordinator‑_client_relations). One active role per GP (serial workflow).
-- =============================================================================

BEGIN;

-- Current active-approver role per pending, non-archived gate pass.
CREATE OR REPLACE VIEW public.gate_pass_active_approvers AS
SELECT
  gp.id            AS gate_pass_id,
  gp.pass_no,
  gp.requester_id,
  gp.requester_name,
  gp.pass_type,
  gp.status        AS pass_status,
  gp.created_at    AS pass_created_at,
  gp.updated_at    AS pass_updated_at,
  gp.has_high_value_asset,
  r.id             AS role_id,
  r.name           AS role_name
FROM public.gate_passes gp
JOIN public.roles r
  ON r.name = regexp_replace(gp.status::text, '^pending_', '')
WHERE gp.status::text ~ '^pending_'
  AND NOT COALESCE(gp.is_archived, false);

COMMENT ON VIEW public.gate_pass_active_approvers IS
  'Current-step approver role per pending gate pass (derived from status). GP '
  'analogue of permit_active_approvers; consumed by get_my_gate_pass_inbox and '
  'the GP notifier.';

-- Inbox: gate passes pending the caller''s effective roles. Delegation-aware for
-- free via get_my_effective_roles (the delegate gains the delegated role). (GP
-- forward-to-user is a separate increment; add active_forward_for here when the
-- gate_pass forward table exists.)
CREATE OR REPLACE FUNCTION public.get_my_gate_pass_inbox()
RETURNS TABLE (gate_pass_id uuid, pass_created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT gpa.gate_pass_id, gpa.pass_created_at
  FROM public.gate_pass_active_approvers gpa
  WHERE gpa.role_name IN (SELECT role_name FROM public.get_my_effective_roles());
$$;
GRANT EXECUTE ON FUNCTION public.get_my_gate_pass_inbox() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
