CREATE OR REPLACE FUNCTION public._ensure_permit_pending_approvals_internal(p_permit_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_permit record;
  v_wf_template uuid;
BEGIN
  SELECT wp.id, wp.work_type_id, wp.status, wp.is_archived, wt.workflow_template_id
    INTO v_permit FROM public.work_permits wp
    LEFT JOIN public.work_types wt ON wt.id = wp.work_type_id
    WHERE wp.id = p_permit_id;
  IF NOT FOUND THEN
    RAISE NOTICE 'ensure_permit_pending_approvals: permit % not found', p_permit_id;
    RETURN 0;
  END IF;
  IF COALESCE(v_permit.is_archived, false) THEN
    RAISE NOTICE 'ensure_permit_pending_approvals: permit % is archived; skip', p_permit_id;
    RETURN 0;
  END IF;
  IF v_permit.status = 'draft' OR v_permit.status IS NULL THEN
    RAISE NOTICE 'ensure_permit_pending_approvals: permit % is draft; skip', p_permit_id;
    RETURN 0;
  END IF;
  v_wf_template := v_permit.workflow_template_id;
  IF v_wf_template IS NULL THEN
    RAISE WARNING 'ensure_permit_pending_approvals: permit % work_type % has NO workflow_template_id — no approval rows will be created. Assign a workflow template to this work type in the Workflow Builder.', p_permit_id, v_permit.work_type_id;
    RETURN 0;
  END IF;
  WITH step_list AS (
    SELECT ws.id AS step_id, ws.role_id, r.name AS role_name, ws.step_order,
      COALESCE(pwo.is_required, wtsc.is_required, ws.is_required_default, true) AS is_required
    FROM public.workflow_steps ws
    JOIN public.roles r ON r.id = ws.role_id
    LEFT JOIN public.permit_workflow_overrides pwo ON pwo.permit_id = p_permit_id AND pwo.workflow_step_id = ws.id
    LEFT JOIN public.work_type_step_config wtsc ON wtsc.work_type_id = v_permit.work_type_id AND wtsc.workflow_step_id = ws.id
    WHERE ws.workflow_template_id = v_wf_template AND r.name IS NOT NULL
  ), to_insert AS (
    INSERT INTO public.permit_approvals (permit_id, workflow_step_id, role_id, role_name, status)
    SELECT p_permit_id, sl.step_id, sl.role_id, sl.role_name, 'pending'
    FROM step_list sl WHERE sl.is_required = true AND NOT EXISTS (
      SELECT 1 FROM public.permit_approvals pa WHERE pa.permit_id = p_permit_id AND pa.role_name = sl.role_name
    )
    ON CONFLICT (permit_id, role_name) DO NOTHING RETURNING 1
  ) SELECT COUNT(*) INTO v_inserted FROM to_insert;
  RAISE NOTICE 'ensure_permit_pending_approvals: permit % inserted % pending approval rows (workflow_template %)', p_permit_id, v_inserted, v_wf_template;
  RETURN v_inserted;
END;
$function$;
REVOKE ALL ON FUNCTION public._ensure_permit_pending_approvals_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ensure_permit_pending_approvals_internal(uuid) TO service_role;
COMMENT ON FUNCTION public._ensure_permit_pending_approvals_internal(uuid) IS 'Private assignment implementation for trusted trigger and guarded RPC; client execution is revoked. Permit mutations remain subject to existing authorization.';

CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals(p_permit_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR (auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.work_permits wp WHERE wp.id = p_permit_id AND wp.requester_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_submit_on_behalf(auth.uid())
    ))
  ) THEN
    RAISE EXCEPTION 'permission denied: only the requester, admin, authorized on-behalf staff, or service role may create pending approvals' USING ERRCODE = '42501';
  END IF;
  RETURN public._ensure_permit_pending_approvals_internal(p_permit_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public._trg_permit_ensure_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- The triggering write already passed its RLS or permission-checked RPC.
  -- Do not reapply the narrower direct-client assignment guard here.
  PERFORM public._ensure_permit_pending_approvals_internal(NEW.id);
  RETURN NEW;
END;
$function$;