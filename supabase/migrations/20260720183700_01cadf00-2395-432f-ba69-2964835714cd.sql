
-- Mirror permit/gate-pass activity into user_activity_logs so the User Activity page
-- captures approvals, rejections, forwards, reworks, schedule changes, and comments —
-- not just login/logout/delegation.

-- 1) Bridge trigger: activity_logs -> user_activity_logs
CREATE OR REPLACE FUNCTION public.tr_mirror_activity_to_user_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     text;
  v_action    text := lower(coalesce(NEW.action, ''));
  v_type      text;
  v_permit_no text;
BEGIN
  IF NEW.performed_by_id IS NULL THEN RETURN NEW; END IF;

  -- Map free-form action text to a normalized action_type
  IF v_action LIKE '%rejected%' THEN
    v_type := 'permit_reject';
  ELSIF v_action LIKE '%rework%' THEN
    v_type := 'permit_rework';
  ELSIF v_action LIKE '%forward%' THEN
    v_type := 'permit_forward';
  ELSIF v_action LIKE '%cancel%' THEN
    v_type := 'permit_cancel';
  ELSIF v_action LIKE '%amend%' OR v_action LIKE '%schedule changed%'
     OR v_action LIKE '%extended%' OR v_action LIKE '%date%changed%' THEN
    v_type := 'permit_amend';
  ELSIF v_action LIKE '%approved%' OR v_action LIKE '%reviewed%' THEN
    v_type := 'permit_approve';
  ELSIF v_action LIKE '%created%' THEN
    v_type := 'permit_create';
  ELSIF v_action LIKE '%email%' OR v_action LIKE '%notif%' OR v_action LIKE '%distrib%' THEN
    -- Skip system-generated email/notification rows to keep the user log user-driven
    RETURN NEW;
  ELSE
    v_type := 'permit_action';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.performed_by_id;
  SELECT permit_no INTO v_permit_no FROM public.work_permits WHERE id = NEW.permit_id;

  INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details)
  VALUES (
    NEW.performed_by_id,
    coalesce(v_email, 'unknown'),
    v_type,
    coalesce(v_permit_no || ' — ', '') || NEW.action ||
      coalesce(' — ' || NULLIF(NEW.details, ''), '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_activity_to_user_log ON public.activity_logs;
CREATE TRIGGER trg_mirror_activity_to_user_log
AFTER INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.tr_mirror_activity_to_user_log();

-- 2) Comments on permits
CREATE OR REPLACE FUNCTION public.tr_mirror_permit_comment_to_user_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     text;
  v_permit_no text;
BEGIN
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.author_id;
  SELECT permit_no INTO v_permit_no FROM public.work_permits WHERE id = NEW.permit_id;
  INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details)
  VALUES (
    NEW.author_id,
    coalesce(v_email, 'unknown'),
    'comment_added',
    'Comment on ' || coalesce(v_permit_no, 'permit')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_permit_comment ON public.permit_comments;
CREATE TRIGGER trg_mirror_permit_comment
AFTER INSERT ON public.permit_comments
FOR EACH ROW EXECUTE FUNCTION public.tr_mirror_permit_comment_to_user_log();

-- 3) Comments on gate passes
CREATE OR REPLACE FUNCTION public.tr_mirror_gp_comment_to_user_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_no    text;
BEGIN
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.author_id;
  SELECT pass_no INTO v_no FROM public.gate_passes WHERE id = NEW.gate_pass_id;
  INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details)
  VALUES (
    NEW.author_id,
    coalesce(v_email, 'unknown'),
    'comment_added',
    'Comment on ' || coalesce(v_no, 'gate pass')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_gp_comment ON public.gate_pass_comments;
CREATE TRIGGER trg_mirror_gp_comment
AFTER INSERT ON public.gate_pass_comments
FOR EACH ROW EXECUTE FUNCTION public.tr_mirror_gp_comment_to_user_log();

-- 4) Amendment lifecycle
CREATE OR REPLACE FUNCTION public.tr_mirror_permit_amendment_to_user_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_email text;
  v_no    text;
  v_type  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_actor := NEW.requested_by;
    v_type  := 'permit_amend_requested';
  ELSE
    v_actor := coalesce(NEW.resolved_by, NEW.requested_by);
    v_type  := 'permit_amend_' || coalesce(NEW.status, 'updated');
  END IF;
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;
  SELECT permit_no INTO v_no FROM public.work_permits WHERE id = NEW.permit_id;
  INSERT INTO public.user_activity_logs (user_id, user_email, action_type, details)
  VALUES (v_actor, coalesce(v_email, 'unknown'), v_type,
          coalesce(v_no, 'permit') || coalesce(' — ' || NULLIF(NEW.reason, ''), ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_permit_amendment ON public.permit_amendments;
CREATE TRIGGER trg_mirror_permit_amendment
AFTER INSERT OR UPDATE ON public.permit_amendments
FOR EACH ROW EXECUTE FUNCTION public.tr_mirror_permit_amendment_to_user_log();
