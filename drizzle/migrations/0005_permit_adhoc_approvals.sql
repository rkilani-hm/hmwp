CREATE TABLE public.permit_adhoc_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  requested_by_role text NOT NULL,
  target_user_id uuid NOT NULL,
  target_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  request_note text,
  comments text,
  signature text,
  signature_hash text,
  auth_method text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX permit_adhoc_one_pending ON public.permit_adhoc_approvals (permit_id, requested_by_user_id) WHERE status = 'pending';
CREATE INDEX permit_adhoc_target_idx ON public.permit_adhoc_approvals (target_user_id) WHERE status = 'pending';
CREATE INDEX permit_adhoc_permit_idx ON public.permit_adhoc_approvals (permit_id);

GRANT SELECT, INSERT, UPDATE ON public.permit_adhoc_approvals TO authenticated;
GRANT ALL ON public.permit_adhoc_approvals TO service_role;
ALTER TABLE public.permit_adhoc_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Adhoc approvals visible to involved users" ON public.permit_adhoc_approvals
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR requested_by_user_id = auth.uid()
  OR target_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.permit_approvals pa JOIN public.user_roles ur ON ur.role_id = pa.role_id
             WHERE pa.permit_id = permit_adhoc_approvals.permit_id AND ur.user_id = auth.uid())
);
CREATE POLICY "Requester inserts own adhoc request" ON public.permit_adhoc_approvals
FOR INSERT TO authenticated WITH CHECK (requested_by_user_id = auth.uid());
CREATE POLICY "Target resolves pending adhoc request" ON public.permit_adhoc_approvals
FOR UPDATE TO authenticated USING (target_user_id = auth.uid() AND status = 'pending')
WITH CHECK (target_user_id = auth.uid());

CREATE TRIGGER trg_permit_adhoc_updated_at BEFORE UPDATE ON public.permit_adhoc_approvals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Adhoc approvers can view permit attachments" ON public.permit_attachments
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.permit_adhoc_approvals a
          WHERE a.permit_id = permit_attachments.permit_id AND a.target_user_id = auth.uid())
);

-- Candidate list: every non-tenant user holding a workflow (approver) role,
-- excluding the caller and anyone already holding a role on this permit's chain.
CREATE OR REPLACE FUNCTION public.list_adhoc_approver_candidates(p_permit_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, role_name text, role_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id) p.id, p.full_name, p.email, r.name, COALESCE(r.label, r.name)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE auth.uid() IS NOT NULL
    AND public.is_non_tenant_staff(auth.uid())
    AND p.id <> auth.uid()
    AND COALESCE(p.is_active, true)
    AND EXISTS (SELECT 1 FROM public.workflow_steps ws WHERE ws.role_id = r.id)
    AND NOT public.is_tenant_only(p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.permit_approvals pa JOIN public.user_roles ur2 ON ur2.role_id = pa.role_id
      WHERE pa.permit_id = p_permit_id AND ur2.user_id = p.id AND pa.status <> 'skipped')
    AND NOT EXISTS (SELECT 1 FROM public.permit_approvals pa WHERE pa.permit_id = p_permit_id AND pa.approver_user_id = p.id)
  ORDER BY p.id, COALESCE(r.label, r.name);
$$;
REVOKE ALL ON FUNCTION public.list_adhoc_approver_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_adhoc_approver_candidates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_additional_approval(p_permit_id uuid, p_target_user_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text; v_target_role text; v_permit_no text;
  v_caller_name text; v_target_name text; v_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_target_user_id = v_caller THEN RAISE EXCEPTION 'You cannot request approval from yourself'; END IF;
  IF EXISTS (SELECT 1 FROM public.permit_adhoc_approvals WHERE permit_id = p_permit_id AND requested_by_user_id = v_caller AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have a pending requested approval on this permit';
  END IF;
  v_role := public.get_my_action_role(p_permit_id);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Only the current approver of this permit can request an additional approval'; END IF;

  SELECT c.role_name INTO v_target_role FROM public.list_adhoc_approver_candidates(p_permit_id) c WHERE c.user_id = p_target_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Selected user is not an eligible approver for this permit'; END IF;

  SELECT permit_no INTO v_permit_no FROM public.work_permits WHERE id = p_permit_id;
  SELECT COALESCE(full_name, email) INTO v_caller_name FROM public.profiles WHERE id = v_caller;
  SELECT COALESCE(full_name, email) INTO v_target_name FROM public.profiles WHERE id = p_target_user_id;

  INSERT INTO public.permit_adhoc_approvals (permit_id, requested_by_user_id, requested_by_role, target_user_id, target_role, request_note)
  VALUES (p_permit_id, v_caller, v_role, p_target_user_id, v_target_role, NULLIF(trim(p_note), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.notifications (user_id, permit_id, type, title, message)
  VALUES (p_target_user_id, p_permit_id, 'adhoc_approval_requested', 'Approval requested',
          format('You have been asked to approve %s by %s', v_permit_no, v_caller_name)
          || COALESCE(' — Note: ' || NULLIF(trim(p_note), ''), ''));

  INSERT INTO public.activity_logs (permit_id, action, performed_by, performed_by_id, details)
  VALUES (p_permit_id, 'Additional Approval Requested', v_caller_name, v_caller,
          format('Additional approval requested from %s by %s', v_target_name, v_caller_name)
          || COALESCE(' — ' || NULLIF(trim(p_note), ''), ''));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.request_additional_approval(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_additional_approval(uuid, uuid, text) TO authenticated;

-- Block the requester's own step while a requested approval is pending.
CREATE OR REPLACE FUNCTION public.authorize_permit_approval(p_user uuid, p_permit_id uuid, p_role_name text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role_id uuid; v_direct boolean; v_admin boolean; v_delegator uuid; v_forwarder uuid; v_on_behalf uuid; v_kind text; v_name text; v_allowed boolean; v_blocked text;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name=p_role_name;
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=p_user AND r.name=p_role_name) INTO v_direct;
  SELECT public.has_role(p_user,'admin'::app_role) INTO v_admin;
  IF NOT v_direct AND p_permit_id IS NOT NULL AND v_role_id IS NOT NULL AND public.is_non_tenant_staff(p_user)
     AND public.active_forward_for(p_permit_id, v_role_id)=p_user THEN
    SELECT f.forwarded_by INTO v_forwarder FROM public.permit_step_forwards f
     WHERE f.permit_id=p_permit_id AND f.role_id=v_role_id AND f.is_active=true ORDER BY f.created_at DESC LIMIT 1;
  END IF;
  IF NOT v_direct AND v_forwarder IS NULL AND public.is_non_tenant_staff(p_user) THEN
    SELECT ad.delegator_id INTO v_delegator FROM public.approval_delegations ad
      JOIN public.user_roles ur ON ur.user_id=ad.delegator_id JOIN public.roles r ON r.id=ur.role_id
     WHERE ad.delegate_id=p_user AND r.name=p_role_name AND (ad.role_id IS NULL OR ad.role_id=r.id)
       AND ad.is_active=true AND now()>=ad.valid_from AND now()<ad.valid_to ORDER BY ad.created_at DESC LIMIT 1;
  END IF;
  v_allowed := v_direct OR v_admin OR (v_forwarder IS NOT NULL) OR (v_delegator IS NOT NULL);
  IF v_forwarder IS NOT NULL THEN v_on_behalf:=v_forwarder; v_kind:='forward';
  ELSIF v_delegator IS NOT NULL THEN v_on_behalf:=v_delegator; v_kind:='delegation'; END IF;
  IF v_on_behalf IS NOT NULL THEN SELECT COALESCE(full_name,email) INTO v_name FROM public.profiles WHERE id=v_on_behalf; END IF;
  IF p_permit_id IS NOT NULL THEN
    SELECT COALESCE(p.full_name, p.email) INTO v_blocked
      FROM public.permit_adhoc_approvals a LEFT JOIN public.profiles p ON p.id = a.target_user_id
     WHERE a.permit_id = p_permit_id AND a.requested_by_user_id = p_user AND a.status = 'pending' LIMIT 1;
    IF FOUND THEN v_allowed := false; END IF;
  END IF;
  RETURN jsonb_build_object('allowed',v_allowed,'is_direct',v_direct,'is_admin',v_admin,'on_behalf_of',v_on_behalf,'on_behalf_of_name',v_name,'on_behalf_of_kind',v_kind,
                            'blocked_by_adhoc', v_blocked IS NOT NULL, 'blocked_by_name', v_blocked);
END; $function$;

-- get_my_action_role must still resolve the caller's step even while blocked
-- (so the UI can show the blocked state); it ignores the adhoc block.
CREATE OR REPLACE FUNCTION public.get_my_action_role(p_permit_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT paa.role_name
  FROM public.permit_active_approvers paa
  LEFT JOIN public.workflow_steps ws ON ws.id = paa.workflow_step_id
  CROSS JOIN LATERAL (SELECT public.authorize_permit_approval(auth.uid(), p_permit_id, paa.role_name) AS a) z
  WHERE paa.permit_id = p_permit_id
    AND ((z.a->>'allowed')::boolean OR (z.a->>'blocked_by_adhoc')::boolean)
    AND ((z.a->>'is_direct')::boolean OR z.a->>'on_behalf_of_kind' IS NOT NULL)
  ORDER BY (z.a->>'is_direct')::boolean DESC, ws.step_order NULLS LAST, paa.role_name
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_inbox_permits()
 RETURNS TABLE(permit_id uuid, sla_deadline timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT paa.permit_id, paa.sla_deadline FROM public.permit_active_approvers paa
  WHERE paa.role_name IN (SELECT role_name FROM public.get_my_effective_roles())
    AND COALESCE(public.active_forward_for(paa.permit_id, paa.role_id), auth.uid())=auth.uid()
  UNION
  SELECT paa.permit_id, paa.sla_deadline FROM public.permit_active_approvers paa
  WHERE public.active_forward_for(paa.permit_id, paa.role_id)=auth.uid()
  UNION
  SELECT a.permit_id, wp.sla_deadline FROM public.permit_adhoc_approvals a
  JOIN public.work_permits wp ON wp.id = a.permit_id
  WHERE a.target_user_id = auth.uid() AND a.status = 'pending';
$function$;