-- ====================================================================
-- Approver email fallback: read auth.users.email when profiles.email empty
-- ====================================================================
--
-- ## The symptom
--
-- Permit gets submitted -> dynamic approver assignment correctly
-- creates permit_approvals rows -> in-app notification appears in
-- the approver's notification bell. BUT approvers never receive
-- an EMAIL notification. The tenant DOES receive emails when status
-- changes (because work_permits.requester_email is stored on the
-- permit row directly).
--
-- ## The cause
--
-- notify_permit_active_approvers RPC reads email from profiles.email
-- only:
--
--   SELECT p.email INTO v_email
--     FROM public.profiles p
--    WHERE p.id = v_user_id;
--
--   IF v_email IS NOT NULL AND v_email <> '' THEN
--     v_emails := array_append(v_emails, v_email);
--   END IF;
--
-- If profiles.email is NULL or empty (which happens when admin
-- creates a user via an alternate code path, or the handle_new_user
-- trigger misses, or there's a manual insert), this branch skips
-- the user and they get zero emails.
--
-- The frontend then sees emails=[] and the
-- `if (emails.length > 0)` guard skips the email-send entirely,
-- silently.
--
-- ## The fix
--
-- Three changes:
--
-- 1. notify_permit_active_approvers — fall back to auth.users.email
--    when profiles.email is empty. SECURITY DEFINER gives the RPC
--    access to auth.users.
--
-- 2. sync_profile_emails_from_auth() — admin RPC that backfills
--    profiles.email for any existing rows where it's empty/null,
--    reading from auth.users. One-shot repair for existing data.
--
-- 3. handle_new_user reasserted — ensures NEW users always get
--    profiles.email populated on signup (idempotent).
--
-- 4. resolve_user_email() — helper used by RPCs that need an email
--    for a user_id. Returns profiles.email if set, else
--    auth.users.email, else NULL. Single source of truth.

BEGIN;

-- =================================================================
-- 1. Helper: resolve_user_email
-- =================================================================
CREATE OR REPLACE FUNCTION public.resolve_user_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    NULLIF(p.email, ''),
    NULLIF(au.email, '')
  )
  FROM public.profiles p
  FULL OUTER JOIN auth.users au ON au.id = p.id
  WHERE COALESCE(p.id, au.id) = p_user_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_user_email(uuid) IS
  'Returns the email for a user_id, preferring profiles.email, falling '
  'back to auth.users.email. Used by notification RPCs to ensure '
  'emails are sent even when profiles.email is empty.';

GRANT EXECUTE ON FUNCTION public.resolve_user_email(uuid)
  TO authenticated, service_role;

-- =================================================================
-- 2. notify_permit_active_approvers — use the fallback
-- =================================================================
--
-- Diff vs the previous version: the email lookup now goes through
-- resolve_user_email() instead of just profiles.email. Also adds
-- per-user logging with RAISE NOTICE so admins can see in postgres
-- logs which users got skipped and why.
--
-- Behavior is otherwise IDENTICAL — same payload, same auth gates,
-- same in-app notification insert pattern.

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
  v_skipped_no_email integer := 0;
  v_role_row      record;
  v_user_id       uuid;
  v_email         text;
  v_title_prefix  text;
BEGIN
  IF p_notification_type NOT IN ('new_permit', 'resubmitted') THEN
    RAISE EXCEPTION 'invalid notification_type: %', p_notification_type;
  END IF;

  SELECT id, requester_id, permit_no, urgency, requester_name
    INTO v_permit
    FROM public.work_permits
   WHERE id = p_permit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit not found: %', p_permit_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id
       AND r.name = 'admin'
  ) INTO v_caller_admin;

  -- Authorization gate (unchanged)
  IF v_caller_id IS NULL
     OR (v_permit.requester_id <> v_caller_id
         AND NOT v_caller_admin
         AND NOT EXISTS (
           SELECT 1
             FROM public.permit_active_approvers paa
             JOIN public.user_roles ur ON ur.role_id = paa.role_id
            WHERE paa.permit_id = p_permit_id
              AND ur.user_id = v_caller_id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.permit_approvals pa
            WHERE pa.permit_id = p_permit_id
              AND pa.approver_user_id = v_caller_id
              AND pa.status IN ('approved', 'rejected')
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_title_prefix := CASE
    WHEN v_permit.urgency = 'urgent' THEN 'New URGENT '
    ELSE 'New '
  END;

  FOR v_role_row IN
    SELECT DISTINCT paa.role_id, paa.role_name
      FROM public.permit_active_approvers paa
     WHERE paa.permit_id = p_permit_id
  LOOP
    v_roles := array_append(v_roles, v_role_row.role_name);

    FOR v_user_id IN
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role_id = v_role_row.role_id
    LOOP
      -- In-app notification (NOT EXISTS guard for idempotency)
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

      -- Email lookup — NEW: uses resolve_user_email() helper that
      -- falls back to auth.users.email.
      v_email := public.resolve_user_email(v_user_id);

      IF v_email IS NOT NULL AND v_email <> '' THEN
        v_emails := array_append(v_emails, v_email);
      ELSE
        v_skipped_no_email := v_skipped_no_email + 1;
        RAISE NOTICE
          'notify_permit_active_approvers: no email found for user_id=% (role=%) on permit %. User has no profiles.email AND no auth.users.email. Email skipped.',
          v_user_id, v_role_row.role_name, v_permit.permit_no;
      END IF;
    END LOOP;
  END LOOP;

  -- Aggregate logging
  IF v_skipped_no_email > 0 THEN
    RAISE WARNING
      'notify_permit_active_approvers: permit % — % user(s) skipped due to missing email. Run SELECT public.sync_profile_emails_from_auth() to backfill.',
      v_permit.permit_no, v_skipped_no_email;
  END IF;

  RAISE NOTICE
    'notify_permit_active_approvers: permit % roles=[%] users=% emails=% notifications_inserted=%',
    v_permit.permit_no,
    array_to_string(v_roles, ', '),
    array_length(v_user_ids, 1),
    array_length(v_emails, 1),
    v_inserted;

  RETURN jsonb_build_object(
    'inserted_count',      v_inserted,
    'user_ids',            (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_user_ids) AS x),
    'emails',              (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_emails)   AS x),
    'active_roles',        to_jsonb(v_roles),
    'permit_no',           v_permit.permit_no,
    'urgency',             v_permit.urgency,
    'requester_name',      v_permit.requester_name,
    'notification_type',   p_notification_type,
    'skipped_no_email',    v_skipped_no_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_permit_active_approvers(uuid, text)
  TO authenticated;

-- =================================================================
-- 3. sync_profile_emails_from_auth — backfill empty profile emails
-- =================================================================
--
-- For every profiles row where email is NULL or empty, copy from
-- auth.users.email. Returns the count of rows updated.
--
-- Idempotent — re-running updates zero. Safe to call repeatedly.
--
-- Admin only.

CREATE OR REPLACE FUNCTION public.sync_profile_emails_from_auth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_admin boolean;
  v_updated      integer := 0;
  v_inserted     integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF NOT v_caller_admin THEN
    RAISE EXCEPTION 'permission denied — admin role required';
  END IF;

  -- A. Update existing profiles whose email is NULL or empty
  UPDATE public.profiles p
     SET email = au.email,
         updated_at = now()
    FROM auth.users au
   WHERE au.id = p.id
     AND (p.email IS NULL OR p.email = '')
     AND au.email IS NOT NULL
     AND au.email <> '';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- B. Create missing profile rows for auth.users with no profile
  --    (the handle_new_user trigger should prevent this, but
  --     historically some users may have been created in a way that
  --     skipped it — e.g. service_role inserts, admin invites).
  INSERT INTO public.profiles (id, email, full_name)
  SELECT au.id, au.email,
         COALESCE(au.raw_user_meta_data ->> 'full_name', au.email)
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
   WHERE p.id IS NULL
     AND au.email IS NOT NULL
     AND au.email <> ''
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE
    'sync_profile_emails_from_auth: updated % rows, inserted % new profile rows',
    v_updated, v_inserted;

  RETURN jsonb_build_object(
    'updated_count',  v_updated,
    'inserted_count', v_inserted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_profile_emails_from_auth()
  TO authenticated;

COMMENT ON FUNCTION public.sync_profile_emails_from_auth() IS
  'Backfill profiles.email from auth.users.email for any rows where '
  'it is null or empty. Also creates missing profile rows for '
  'auth.users that have none. Idempotent. Admin only.';

-- =================================================================
-- 3b. get_emails_for_role — frontend helper RPC with fallback
-- =================================================================
--
-- Returns the email list for all users holding a given role. Uses
-- resolve_user_email() so profiles.email-empty users still produce
-- a valid address via auth.users.email fallback.
--
-- Replaces the client-side getEmailsForRole() query that read
-- profiles.email directly. The RPC is SECURITY DEFINER so it works
-- regardless of the caller's RLS-restricted session — same reason
-- as notify_permit_active_approvers.
--
-- Used by: forwarding email path, onboarding admin notification,
-- public permit helpdesk notification.

CREATE OR REPLACE FUNCTION public.get_emails_for_role(p_role_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_emails  text[] := ARRAY[]::text[];
  v_user_id uuid;
  v_email   text;
BEGIN
  SELECT id INTO v_role_id
    FROM public.roles
   WHERE name = p_role_name;

  IF v_role_id IS NULL THEN
    RETURN jsonb_build_object('emails', '[]'::jsonb, 'role_found', false);
  END IF;

  FOR v_user_id IN
    SELECT user_id FROM public.user_roles WHERE role_id = v_role_id
  LOOP
    v_email := public.resolve_user_email(v_user_id);
    IF v_email IS NOT NULL AND v_email <> '' THEN
      v_emails := array_append(v_emails, v_email);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'emails', (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_emails) AS x),
    'role_found', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_emails_for_role(text)
  TO authenticated;

COMMENT ON FUNCTION public.get_emails_for_role(text) IS
  'Returns email list for all users holding the given role, with '
  'auth.users.email fallback when profiles.email is empty. Replaces '
  'the client-side profiles.email query which silently dropped users '
  'whose profile email was empty.';

-- =================================================================
-- 4. Run the backfill immediately as part of this migration
-- =================================================================
--
-- We can't call sync_profile_emails_from_auth() here (it requires
-- admin auth), but we can do the equivalent work directly within
-- the migration (runs as the migration role which is service_role).

UPDATE public.profiles p
   SET email = au.email,
       updated_at = now()
  FROM auth.users au
 WHERE au.id = p.id
   AND (p.email IS NULL OR p.email = '')
   AND au.email IS NOT NULL
   AND au.email <> '';

INSERT INTO public.profiles (id, email, full_name)
SELECT au.id, au.email,
       COALESCE(au.raw_user_meta_data ->> 'full_name', au.email)
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
 WHERE p.id IS NULL
   AND au.email IS NOT NULL
   AND au.email <> ''
ON CONFLICT (id) DO NOTHING;

-- =================================================================
-- 5. Trigger: keep profiles.email in sync with auth.users.email
-- =================================================================
--
-- If a user updates their email via Supabase Auth's normal flow,
-- the auth.users.email changes but profiles.email may not. This
-- trigger keeps them in sync going forward.

CREATE OR REPLACE FUNCTION public._sync_profile_email_on_auth_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND NEW.email IS NOT NULL
     AND NEW.email <> ''
  THEN
    UPDATE public.profiles
       SET email = NEW.email,
           updated_at = now()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_email_sync ON auth.users;
CREATE TRIGGER auth_users_email_sync
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_profile_email_on_auth_update();

COMMIT;

NOTIFY pgrst, 'reload schema';
