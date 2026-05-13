-- Server-side permit forwarding RPC + active-approver lookup helper
--
-- ## Bugs this fixes
--
-- ### Bug 1 — useForwardPermit hardcoded statusMap
--
-- src/hooks/useWorkPermits.ts useForwardPermit() has:
--
--   const statusMap: Record<string, PermitStatus> = {
--     helpdesk: 'submitted',
--     pm: 'pending_pm',
--     pd: 'pending_pd',
--     ...
--   };
--   const newStatus = statusMap[targetRole];
--   if (!newStatus) throw new Error('Invalid target role');
--
-- Forwarding to ANY custom role (al_hamra_customer_service, etc.)
-- throws "Invalid target role" because the role isn't in the map.
-- Even legacy roles created after this list was written fail.
--
-- ### Bug 2 — same RLS-broken pattern for fan-out
--
-- After updating status, the function does:
--
--   await supabase.from('user_roles').select('user_id').eq('role_id', X);
--
-- Running in the FORWARDING APPROVER's session. user_roles RLS only
-- allows users to see their OWN row — same problem the tenant
-- submission flow had. Approvers can't list target role's holders.
-- Notification fan-out silently no-ops.
--
-- ### Bug 3 — approval rows out of sync after forward
--
-- The function only updates work_permits.status. It doesn't touch
-- permit_approvals. So the row for the previous active role remains
-- 'pending'. permit_active_approvers view (which the inbox reads)
-- returns the PREVIOUS role, not the forwarded-to role. Forward UI
-- says "forwarded to PM" but PM doesn't see it in their inbox;
-- the previous approver still does.
--
-- ## Fix
--
-- forward_permit_to_role(permit_id, target_role_name, reason) RPC:
--
--   1. Validates caller authorization:
--      - currently an active approver of the permit, OR
--      - admin
--      → otherwise 'permission denied'
--
--   2. Validates target_role_name exists in public.roles.
--
--   3. Marks ALL existing pending permit_approvals rows on this
--      permit as 'skipped' — they're no longer the active step
--      after the forward. (Approver intent: 'I'm not acting; route
--      it elsewhere.')
--
--   4. Inserts/updates a permit_approvals row for the target role
--      with status='pending'. UPSERT on (permit_id, role_name).
--      Uses the first workflow_steps row matching target_role_name
--      (if any) for workflow_step_id; falls back to NULL.
--
--   5. Updates work_permits.status to 'pending_<target_role_name>'.
--      The dynamic-permit-status-enum migration ensures the enum
--      value exists for any role.
--
--   6. Logs activity_logs entry.
--
-- After the RPC returns, the frontend calls notify_permit_active_approvers
-- to ping the new target. Both RPCs are SECURITY DEFINER so the
-- whole flow works regardless of caller's RLS-restricted session.

BEGIN;

CREATE OR REPLACE FUNCTION public.forward_permit_to_role(
  p_permit_id        uuid,
  p_target_role_name text,
  p_reason           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit       record;
  v_caller_id    uuid := auth.uid();
  v_caller_admin boolean;
  v_target_role  record;
  v_workflow_step_id uuid;
  v_new_status   text;
  v_caller_name  text;
  v_skipped      integer := 0;
BEGIN
  -- Load permit (SECURITY DEFINER bypasses RLS)
  SELECT id, permit_no, status, work_type_id, is_archived, requester_id
    INTO v_permit
    FROM public.work_permits
   WHERE id = p_permit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit not found: %', p_permit_id;
  END IF;

  IF COALESCE(v_permit.is_archived, false) THEN
    RAISE EXCEPTION 'permit is archived';
  END IF;

  IF v_permit.status::text IN ('approved', 'rejected', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'cannot forward terminal-state permit (status=%)', v_permit.status;
  END IF;

  -- Authorization: caller must be admin OR a current active approver
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF NOT v_caller_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.permit_active_approvers paa
        JOIN public.user_roles ur ON ur.role_id = paa.role_id
       WHERE paa.permit_id = p_permit_id AND ur.user_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'permission denied — must be admin or active approver to forward';
    END IF;
  END IF;

  -- Validate target role exists
  SELECT id, name, label INTO v_target_role
    FROM public.roles
   WHERE name = p_target_role_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown target role: %', p_target_role_name;
  END IF;

  -- Find a workflow_steps row that references this role (any template).
  -- Used only to record workflow_step_id on the new approval row for
  -- proper sorting/joins. NULL is fine if no matching step.
  SELECT ws.id INTO v_workflow_step_id
    FROM public.workflow_steps ws
    JOIN public.work_types wt ON wt.workflow_template_id = ws.workflow_template_id
   WHERE wt.id = v_permit.work_type_id
     AND ws.role_id = v_target_role.id
   LIMIT 1;

  -- Mark all currently-pending approval rows as 'skipped'. They're no
  -- longer active because we're routing elsewhere. UPDATE returns
  -- 0 if no pending rows (which is fine — forward still proceeds).
  UPDATE public.permit_approvals
     SET status = 'skipped',
         updated_at = now()
   WHERE permit_id = p_permit_id
     AND status = 'pending';
  GET DIAGNOSTICS v_skipped = ROW_COUNT;

  -- Upsert a fresh pending row for the target role.
  INSERT INTO public.permit_approvals (
    permit_id, workflow_step_id, role_id, role_name, status
  )
  VALUES (
    p_permit_id, v_workflow_step_id, v_target_role.id, v_target_role.name, 'pending'
  )
  ON CONFLICT (permit_id, role_name) DO UPDATE
    SET status = 'pending',
        approver_user_id = NULL,
        approver_name    = NULL,
        approver_email   = NULL,
        approved_at      = NULL,
        comments         = NULL,
        signature        = NULL,
        workflow_step_id = COALESCE(EXCLUDED.workflow_step_id,
                                    public.permit_approvals.workflow_step_id),
        updated_at       = now();

  -- Compute the new status enum value. The dynamic-permit-status-enum
  -- migration ensures pending_<role_name> exists for any role admin
  -- has created (auto-extended via trigger on roles INSERT/UPDATE).
  v_new_status := 'pending_' || v_target_role.name;

  -- Try to set the status. If for any reason the enum value isn't
  -- there yet (very rare — only if the dynamic-enum migration hasn't
  -- been applied), fall back to 'under_review' which always exists.
  BEGIN
    UPDATE public.work_permits
       SET status = v_new_status::permit_status,
           updated_at = now()
     WHERE id = p_permit_id;
  EXCEPTION WHEN invalid_text_representation OR check_violation THEN
    RAISE NOTICE 'pending_<role> enum value not found for %, falling back to under_review', v_target_role.name;
    UPDATE public.work_permits
       SET status = 'under_review'::permit_status,
           updated_at = now()
     WHERE id = p_permit_id;
  END;

  -- Activity log. We need the caller's display name; if profiles RLS
  -- blocked the lookup in the calling session, we'd lose it.
  -- SECURITY DEFINER means this read succeeds for any caller.
  SELECT full_name INTO v_caller_name
    FROM public.profiles
   WHERE id = v_caller_id;

  INSERT INTO public.activity_logs (
    permit_id, action, performed_by, performed_by_id, details
  )
  VALUES (
    p_permit_id,
    'Forwarded',
    COALESCE(v_caller_name, 'Unknown'),
    v_caller_id,
    'Forwarded to ' || v_target_role.name ||
      CASE WHEN p_reason IS NOT NULL AND p_reason <> ''
           THEN ' — ' || p_reason
           ELSE '' END
  );

  RETURN jsonb_build_object(
    'permit_id',             p_permit_id,
    'permit_no',             v_permit.permit_no,
    'target_role',           v_target_role.name,
    'target_role_label',     v_target_role.label,
    'new_status',            v_new_status,
    'previous_pending_skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.forward_permit_to_role(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.forward_permit_to_role(uuid, text, text) IS
  'Forward a permit to a different approver role. Updates '
  'permit_approvals (marks prior pending as skipped, inserts/updates '
  'pending row for target), updates work_permits.status, logs activity. '
  'Authorization: caller must be admin or a currently-active approver '
  'of the permit. Returns JSON with permit_no, target_role, new_status.';

COMMIT;

NOTIFY pgrst, 'reload schema';
