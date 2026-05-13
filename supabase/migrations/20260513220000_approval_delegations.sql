-- Approval Delegation
--
-- Lets an approver temporarily hand off their approval authority to
-- a teammate (same role OR different role). Common use: approver is
-- on leave, delegates to a deputy. Approver returns, delegation
-- auto-expires.
--
-- ## Design
--
-- One table, one view. The view is the magic — it transparently
-- merges direct role assignments (user_roles) with active delegations
-- so the rest of the app doesn't need to know about delegation at
-- all. The inbox query, the approve fn, the workflow visualizer —
-- they all keep reading `roles` for the current user and the
-- view returns the augmented set.
--
-- approval_delegations:
--   - delegator_id: the original approver going on leave
--   - delegate_id:  the teammate receiving authority
--   - role_id:      OPTIONAL. If set, delegation applies only to
--                   permits the delegator would handle in THIS role.
--                   NULL = delegate ALL of delegator's roles (blanket).
--   - valid_from / valid_to: bounded time window
--   - is_active:    explicit kill switch (user-revocable)
--   - reason:       free text, shown in audit logs
--
-- effective_approvers view:
--   For each (user_id, role) pair this view returns one row. It
--   includes:
--     - Every direct user_roles assignment
--     - Every active delegation, attributed to the delegate
--   Plus, for delegated rows, it carries the delegation_id and
--   original_holder_id so the audit log can record both.
--
-- ## Why a view, not column changes to user_roles
--
-- user_roles is the source of truth for permanent assignments;
-- delegations are temporary. Mixing them in one table would muddle
-- both. The view layer keeps the model clean and the rest of the
-- app unchanged — `select role_name from effective_approvers where
-- effective_user_id = $1` is a drop-in replacement for the existing
-- direct lookup.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  delegator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegate_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role_id      uuid REFERENCES public.roles(id) ON DELETE CASCADE,

  valid_from   timestamptz NOT NULL DEFAULT now(),
  valid_to     timestamptz NOT NULL,
  reason       text,
  is_active    boolean NOT NULL DEFAULT true,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CHECK (delegator_id <> delegate_id),
  CHECK (valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator
  ON public.approval_delegations(delegator_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate
  ON public.approval_delegations(delegate_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_approval_delegations_validity
  ON public.approval_delegations(valid_from, valid_to) WHERE is_active = true;

COMMENT ON TABLE public.approval_delegations IS
  'Temporary delegation of approval authority. Resolved in real time '
  'by the effective_approvers view; no rows in user_roles are touched.';

-- ---------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------
ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read delegations that involve them (as
-- delegator OR delegate). Admins see all.
CREATE POLICY "Users see own delegations"
  ON public.approval_delegations FOR SELECT
  USING (
    delegator_id = auth.uid()
    OR delegate_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Only the delegator can create a delegation FROM themselves. Admins
-- can create on anyone's behalf (e.g. if an approver is locked out).
CREATE POLICY "Delegator creates own delegations"
  ON public.approval_delegations FOR INSERT
  WITH CHECK (
    delegator_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Only the delegator (or an admin) can update or revoke.
CREATE POLICY "Delegator updates own delegations"
  ON public.approval_delegations FOR UPDATE
  USING (
    delegator_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    delegator_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Delegator deletes own delegations"
  ON public.approval_delegations FOR DELETE
  USING (
    delegator_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tr_approval_delegations_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_delegations_touch ON public.approval_delegations;
CREATE TRIGGER approval_delegations_touch
  BEFORE UPDATE ON public.approval_delegations
  FOR EACH ROW EXECUTE FUNCTION public.tr_approval_delegations_touch();

-- ---------------------------------------------------------------
-- 3. effective_approvers view
-- ---------------------------------------------------------------
--
-- One row per (user, role) the user CURRENTLY has authority for —
-- whether directly assigned or via active delegation. The rest of
-- the app reads this view instead of user_roles when it needs to
-- answer "what can this user approve right now?".
--
-- The shape is intentionally chosen to be a superset of user_roles:
-- existing queries can be retargeted with minimal change.

CREATE OR REPLACE VIEW public.effective_approvers
WITH (security_invoker = true) AS
  -- Direct role assignments
  SELECT
    ur.user_id          AS effective_user_id,
    r.id                AS role_id,
    r.name              AS role_name,
    r.label             AS role_label,
    NULL::uuid          AS via_delegation_id,
    NULL::uuid          AS original_holder_id,
    NULL::timestamptz   AS delegation_valid_to,
    NULL::text          AS delegation_reason
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id

  UNION

  -- Active delegations: the delegate effectively HAS each of the
  -- delegator's roles (filtered by role_id if the delegation is
  -- role-scoped).
  SELECT
    ad.delegate_id      AS effective_user_id,
    r.id                AS role_id,
    r.name              AS role_name,
    r.label             AS role_label,
    ad.id               AS via_delegation_id,
    ad.delegator_id     AS original_holder_id,
    ad.valid_to         AS delegation_valid_to,
    ad.reason           AS delegation_reason
  FROM public.approval_delegations ad
  JOIN public.user_roles ur
    ON ur.user_id = ad.delegator_id
   AND (ad.role_id IS NULL OR ad.role_id = ur.role_id)
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ad.is_active = true
    AND now() >= ad.valid_from
    AND now() <  ad.valid_to;

COMMENT ON VIEW public.effective_approvers IS
  'Union of direct user_roles and active approval_delegations. '
  'Read this view (not user_roles) when asking "what can user X '
  'do right now?".';

GRANT SELECT ON public.effective_approvers TO authenticated;

-- ---------------------------------------------------------------
-- 4. Helper function used by the activity-log annotation
-- ---------------------------------------------------------------
--
-- Given a (user_id, role_name) pair, returns the delegator's user_id
-- IF the user is acting via a delegation right now; otherwise NULL.
-- Used by useApprovePermit on the client side to detect that an
-- approval is being made via delegation and annotate the audit log.

CREATE OR REPLACE FUNCTION public.get_delegation_origin(
  acting_user_id uuid,
  acting_role_name text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT original_holder_id
  FROM public.effective_approvers
  WHERE effective_user_id = acting_user_id
    AND role_name = acting_role_name
    AND via_delegation_id IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_delegation_origin(uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
