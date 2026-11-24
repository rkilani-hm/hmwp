ALTER TABLE public.permit_adhoc_approvals DROP CONSTRAINT IF EXISTS permit_adhoc_approvals_status_check;
ALTER TABLE public.permit_adhoc_approvals ADD CONSTRAINT permit_adhoc_approvals_status_check CHECK (status IN ('pending','approved','rejected','cancelled'));

CREATE OR REPLACE FUNCTION public.cancel_additional_approval(p_adhoc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); r public.permit_adhoc_approvals%ROWTYPE; v_name text; v_permit_no text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO r FROM public.permit_adhoc_approvals WHERE id = p_adhoc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.requested_by_user_id <> v_caller AND NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only the requester or an admin can cancel this request';
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;
  UPDATE public.permit_adhoc_approvals SET status = 'cancelled' WHERE id = p_adhoc_id;
  SELECT COALESCE(full_name, email) INTO v_name FROM public.profiles WHERE id = v_caller;
  SELECT permit_no INTO v_permit_no FROM public.work_permits WHERE id = r.permit_id;
  INSERT INTO public.activity_logs (permit_id, action, performed_by, performed_by_id, details)
  VALUES (r.permit_id, 'Requested Approval Withdrawn', v_name, v_caller, format('Requested approval withdrawn by %s', v_name));
  INSERT INTO public.notifications (user_id, permit_id, type, title, message)
  VALUES (r.target_user_id, r.permit_id, 'adhoc_approval_withdrawn', 'Approval request withdrawn',
          format('%s withdrew the approval request on %s — no action needed', v_name, v_permit_no));
END; $$;
REVOKE ALL ON FUNCTION public.cancel_additional_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_additional_approval(uuid) TO authenticated;