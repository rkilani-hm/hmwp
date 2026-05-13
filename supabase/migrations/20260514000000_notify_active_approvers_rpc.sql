-- Server-side notification fan-out for permit approvers
--
-- ## The bug this fixes
--
-- When a TENANT submits a permit, the post-insert notification fan-out
-- in useWorkPermits.ts runs in the TENANT's authenticated session:
--
--   notifyActiveApprovers(permitId)
--     -> reads permit_active_approvers          [tenant CAN see own permit]
--     -> for each role:
--        notifyRoleUsers(roleName)
--          -> select * from user_roles where role_id=X   [BLOCKED by RLS!]
--          -> select * from profiles where id in (...)   [BLOCKED by RLS!]
--          -> insert into notifications                  [WITH CHECK (true), OK]
--
-- RLS on user_roles only lets a user see their OWN rows. Profiles RLS
-- only lets a user see their OWN profile. So tenants get back empty
-- arrays from the lookups, the fan-out silently no-ops, and no
-- approver gets notified.
--
-- When an ADMIN submits the same permit, the admin's session DOES have
-- broader access (via 'Admins can view all user_roles' policy), so the
-- exact same code path works. That's why "admin-created permits show
-- up but tenant-created permits don't".
--
-- ## Architecture of the fix
--
-- Move the fan-out into a SECURITY DEFINER RPC. SECURITY DEFINER runs
-- with the function owner's privileges (postgres / service_role)
-- instead of the caller's, so RLS on user_roles + profiles doesn't
-- apply. The RPC:
--
--   1. Validates the caller is allowed to trigger notifications for
--      this permit (must be the requester, or an admin, or an active
--      approver of the permit). Prevents abuse.
--
--   2. Reads permit_active_approvers for the permit.
--
--   3. For each active role, finds all holders via user_roles, inserts
--      one in-app notification per holder (dedup'd by NOT EXISTS to
--      keep the call idempotent on retries).
--
--   4. Returns a JSON payload with:
--      - inserted_count: # of in-app notifications inserted
--      - user_ids:       all holders of any active role
--      - emails:         their profile emails (for the frontend to
--                        invoke send-email-notification with)
--      - active_roles:   list of role_names notified
--      - permit_no:      so frontend doesn't need to re-fetch
--      - urgency:        same
--      - notification_type: 'new_permit' or 'resubmitted'
--      - requester_name:    so emails render correctly
--
-- The frontend then takes the returned emails + user_ids and invokes
-- send-email-notification + send-push-notification edge functions
-- (which run under service_role and have no RLS issues).
--
-- ## Idempotency
--
-- The NOT EXISTS guard against existing (user_id, permit_id, type)
-- triples means re-running the RPC for the same permit + type doesn't
-- duplicate in-app notifications. Useful if a frontend retry happens.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_permit_active_approvers(
  p_permit_id        uuid,
  p_notification_type text DEFAULT 'new_permit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit        record;
  v_caller_id     uuid := auth.uid();
  v_caller_admin  boolean;
  v_inserted      integer := 0;
  v_user_ids      uuid[]  := ARRAY[]::uuid[];
  v_emails        text[]  := ARRAY[]::text[];
  v_roles         text[]  := ARRAY[]::text[];
  v_role_row      record;
  v_user_id       uuid;
  v_email         text;
  v_title_prefix  text;
BEGIN
  -- Validate notification type. Only the values the notifications
  -- table CHECK constraint accepts.
  IF p_notification_type NOT IN ('new_permit', 'resubmitted') THEN
    RAISE EXCEPTION 'invalid notification_type: %', p_notification_type;
  END IF;

  -- Load the permit. Bypasses RLS because we're SECURITY DEFINER.
  SELECT id, requester_id, permit_no, urgency, requester_name
    INTO v_permit
    FROM public.work_permits
   WHERE id = p_permit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit not found: %', p_permit_id;
  END IF;

  -- Authorization: caller must be requester, admin, or active approver.
  -- (Approvers can self-trigger to retry notifications on a permit
  -- they're working on.)
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id
       AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF v_caller_id IS NULL
     OR (v_permit.requester_id <> v_caller_id
         AND NOT v_caller_admin
         AND NOT EXISTS (
           SELECT 1
             FROM public.permit_active_approvers paa
             JOIN public.user_roles ur ON ur.role_id = paa.role_id
            WHERE paa.permit_id = p_permit_id
              AND ur.user_id = v_caller_id
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Title prefix derived from urgency.
  v_title_prefix := CASE
    WHEN v_permit.urgency = 'urgent' THEN 'New URGENT '
    ELSE 'New '
  END;

  -- For each distinct active approver role, fan out.
  FOR v_role_row IN
    SELECT DISTINCT paa.role_id, paa.role_name
      FROM public.permit_active_approvers paa
     WHERE paa.permit_id = p_permit_id
  LOOP
    v_roles := array_append(v_roles, v_role_row.role_name);

    -- All users holding this role. user_roles is read directly here —
    -- SECURITY DEFINER bypasses the "users can only see own roles" RLS
    -- that would otherwise apply to a tenant caller.
    FOR v_user_id IN
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role_id = v_role_row.role_id
    LOOP
      -- Insert one in-app notification per (user, permit) for this
      -- notification type, unless one already exists. Idempotent on
      -- retries.
      INSERT INTO public.notifications (
        user_id, permit_id, type, title, message
      )
      SELECT
        v_user_id, p_permit_id, p_notification_type,
        CASE p_notification_type
          WHEN 'resubmitted' THEN 'Work Permit Resubmitted for Review'
          ELSE v_title_prefix || 'Permit Awaiting Your Review'
        END,
        v_permit.permit_no ||
          CASE p_notification_type
            WHEN 'resubmitted' THEN ' has been resubmitted for your approval. '
            ELSE ' is pending your approval. '
          END ||
          CASE WHEN v_permit.urgency = 'urgent'
               THEN '4-hour SLA.'
               ELSE '48-hour SLA.' END
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id   = v_user_id
           AND n.permit_id = p_permit_id
           AND n.type      = p_notification_type
      );

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      END IF;

      v_user_ids := array_append(v_user_ids, v_user_id);

      -- Lookup email so the frontend can send via send-email-notification.
      SELECT p.email INTO v_email
        FROM public.profiles p
       WHERE p.id = v_user_id;

      IF v_email IS NOT NULL AND v_email <> '' THEN
        v_emails := array_append(v_emails, v_email);
      END IF;
    END LOOP;
  END LOOP;

  -- De-dupe arrays for cleaner downstream consumption.
  RETURN jsonb_build_object(
    'inserted_count',   v_inserted,
    'user_ids',         (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_user_ids) AS x),
    'emails',           (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_emails)   AS x),
    'active_roles',     to_jsonb(v_roles),
    'permit_no',        v_permit.permit_no,
    'urgency',          v_permit.urgency,
    'requester_name',   v_permit.requester_name,
    'notification_type', p_notification_type
  );
END;
$$;

COMMENT ON FUNCTION public.notify_permit_active_approvers(uuid, text) IS
  'Server-side fan-out of approver notifications for a permit. Reads '
  'permit_active_approvers, inserts in-app notifications for each '
  'role-holder (idempotent), and returns the user_ids + emails so the '
  'frontend can invoke send-email-notification + send-push-notification. '
  'Authorization: caller must be the requester, an admin, or an active '
  'approver of the permit.';

-- SECURITY DEFINER functions are not callable by authenticated by
-- default — must grant EXECUTE.
GRANT EXECUTE ON FUNCTION public.notify_permit_active_approvers(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
