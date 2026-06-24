-- =============================================================================
-- Delegation — delegator keeps their role   spec: specs/fix-delegation-delegator-keeps-role.md
-- =============================================================================
--
-- Previously get_my_effective_roles() SUBTRACTED any role the user had delegated
-- away (the `active_delegation_for(...) IS NULL` filter on branch 1). For a
-- blanket delegation that emptied the delegator's effective-role set, so the
-- frontend mislabeled them a tenant (useIsTenantOnly: "no roles => tenant") and
-- they lost inbox/dashboard visibility.
--
-- Fix (R1): the delegator RETAINS all their direct roles regardless of active
-- delegations. Delegation no longer changes what the delegator can SEE; it only
-- (a) ADDS the role to the delegate's effective set (branch 2, unchanged) and
-- (b) reroutes notifications/reminders to the delegate at the notify layer
-- (notify_permit_active_approvers + the edge next-step notifier), not here.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_effective_roles()
RETURNS TABLE (role_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Direct assignments — kept in full. The delegator no longer loses the role
  -- they delegated; they keep visibility/awareness of the relevant items.
  SELECT r.name
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()

  UNION

  -- Roles delegated TO me by an active delegation where I am the winning delegate.
  SELECT r.name
  FROM public.approval_delegations ad
  JOIN public.user_roles ur
    ON ur.user_id = ad.delegator_id
   AND (ad.role_id IS NULL OR ad.role_id = ur.role_id)
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ad.is_active = true
    AND now() >= ad.valid_from
    AND now() <  ad.valid_to
    AND public.active_delegation_for(ad.delegator_id, ur.role_id) = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_effective_roles() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
