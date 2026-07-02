-- =============================================================================
-- SECURITY FIX: role-specific authorization for gate pass approvals
-- =============================================================================
-- verify-gate-pass-approval previously only checked is_gate_pass_approver()
-- (true for ANY gate-pass role) and then trusted the client-supplied `role`
-- to write that role's sign-off columns + advance the pass. That let one
-- approver forge another role's approval (e.g. Finance fabricating the
-- Security sign-off) or single-handedly finalize a pass.
--
-- This function mirrors WP's authorize_permit_approval: the caller may act as
-- `p_role_name` on this pass ONLY IF they hold that role (directly, or as its
-- active delegate, or are admin) AND it is that role's current step
-- (gate_passes.status = 'pending_' || p_role_name). The edge function calls it
-- and rejects with 403 otherwise.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.authorize_gate_pass_approval(p_user uuid, p_gate_pass_id uuid, p_role_name text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $fn$
DECLARE v_status text; v_role_id uuid;
BEGIN
  SELECT status INTO v_status FROM public.gate_passes WHERE id = p_gate_pass_id;
  -- Must be exactly this role's turn in the workflow.
  IF v_status IS NULL OR v_status <> ('pending_' || p_role_name) THEN RETURN false; END IF;
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN RETURN false; END IF;
  RETURN (
    public.has_role(p_user, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user AND ur.role_id = v_role_id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.role_id = v_role_id AND public.active_delegation_for(ur.user_id, v_role_id) = p_user)
  );
END $fn$;

GRANT EXECUTE ON FUNCTION public.authorize_gate_pass_approval(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
