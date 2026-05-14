BEGIN;

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
  'Returns the email for a user_id, preferring profiles.email, falling back to auth.users.email.';

GRANT EXECUTE ON FUNCTION public.resolve_user_email(uuid) TO authenticated, service_role;

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
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF v_caller_id IS NULL
     OR (v_permit.requester_id <> v_caller_id
         AND NOT v_caller_admin
         AND NOT EXISTS (
           SELECT 1 FROM public.permit_active_approvers paa
             JOIN public.user_roles ur ON ur.role_id = paa.role_id
            WHERE paa.permit_id = p_permit_id AND ur.user_id = v_caller_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.permit_approvals pa
            WHERE pa.permit_id = p_permit_id
              AND pa.approver_user_id = v_caller_id
              AND pa.status IN ('approved', 'rejected')
         ))
  THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  v_title_prefix := CASE WHEN v_permit.urgency = 'urgent' THEN 'New URGENT ' ELSE 'New ' END;

  FOR v_role_row IN
    SELECT DISTINCT paa.role_id, paa.role_name
      FROM public.permit_active_approvers paa
     WHERE paa.permit_id = p_permit_id
  LOOP
    v_roles := array_append(v_roles, v_role_row.role_name);

    FOR v_user_id IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role_id = v_role_row.role_id
    LOOP
      INSERT INTO public.notifications (user_id, permit_id, type, title, message)
      SELECT v_user_id, p_permit_id, p_notification_type,
        CASE p_notification_type
          WHEN 'resubmitted' THEN 'Work Permit Resubmitted for Review'
          ELSE v_title_prefix || 'Permit Awaiting Your Review'
        END,
        v_permit.permit_no ||
          CASE p_notification_type
            WHEN 'resubmitted' THEN ' has been resubmitted for your approval. '
            ELSE ' is pending your approval. '
          END ||
          CASE WHEN v_permit.urgency = 'urgent' THEN '4-hour SLA.' ELSE '48-hour SLA.' END
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_user_id AND n.permit_id = p_permit_id AND n.type = p_notification_type
      );

      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
      v_user_ids := array_append(v_user_ids, v_user_id);

      v_email := public.resolve_user_email(v_user_id);
      IF v_email IS NOT NULL AND v_email <> '' THEN
        v_emails := array_append(v_emails, v_email);
      ELSE
        v_skipped_no_email := v_skipped_no_email + 1;
        RAISE NOTICE 'notify_permit_active_approvers: no email found for user_id=% (role=%) on permit %.',
          v_user_id, v_role_row.role_name, v_permit.permit_no;
      END IF;
    END LOOP;
  END LOOP;

  IF v_skipped_no_email > 0 THEN
    RAISE WARNING 'notify_permit_active_approvers: permit % — % user(s) skipped due to missing email.',
      v_permit.permit_no, v_skipped_no_email;
  END IF;

  RETURN jsonb_build_object(
    'inserted_count', v_inserted,
    'user_ids', (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_user_ids) AS x),
    'emails', (SELECT to_jsonb(array_agg(DISTINCT x)) FROM unnest(v_emails) AS x),
    'active_roles', to_jsonb(v_roles),
    'permit_no', v_permit.permit_no,
    'urgency', v_permit.urgency,
    'requester_name', v_permit.requester_name,
    'notification_type', p_notification_type,
    'skipped_no_email', v_skipped_no_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_permit_active_approvers(uuid, text) TO authenticated;

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

  UPDATE public.profiles p
     SET email = au.email, updated_at = now()
    FROM auth.users au
   WHERE au.id = p.id
     AND (p.email IS NULL OR p.email = '')
     AND au.email IS NOT NULL AND au.email <> '';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.profiles (id, email, full_name)
  SELECT au.id, au.email, COALESCE(au.raw_user_meta_data ->> 'full_name', au.email)
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
   WHERE p.id IS NULL AND au.email IS NOT NULL AND au.email <> ''
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('updated_count', v_updated, 'inserted_count', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_profile_emails_from_auth() TO authenticated;

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
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN
    RETURN jsonb_build_object('emails', '[]'::jsonb, 'role_found', false);
  END IF;

  FOR v_user_id IN SELECT user_id FROM public.user_roles WHERE role_id = v_role_id
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

GRANT EXECUTE ON FUNCTION public.get_emails_for_role(text) TO authenticated;

-- Backfill immediately
UPDATE public.profiles p
   SET email = au.email, updated_at = now()
  FROM auth.users au
 WHERE au.id = p.id
   AND (p.email IS NULL OR p.email = '')
   AND au.email IS NOT NULL AND au.email <> '';

INSERT INTO public.profiles (id, email, full_name)
SELECT au.id, au.email, COALESCE(au.raw_user_meta_data ->> 'full_name', au.email)
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
 WHERE p.id IS NULL AND au.email IS NOT NULL AND au.email <> ''
ON CONFLICT (id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';