REVOKE EXECUTE ON FUNCTION public.approver_pending_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approver_pending_digest() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_emails_for_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_emails_for_role(text) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals(p_permit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_permit record;
  v_wf_template uuid;
BEGIN
  -- SECURITY DEFINER current_user is the owner, not the calling user.
  IF NOT (
    COALESCE(auth.role() = 'service_role', false)
    OR (auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.work_permits wp
              WHERE wp.id = p_permit_id AND wp.requester_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_submit_on_behalf(auth.uid())
    ))
  ) THEN
    RAISE EXCEPTION 'permission denied: only the requester, admin, authorized on-behalf staff, or service role may create pending approvals'
      USING ERRCODE = '42501';
  END IF;

  SELECT wp.id, wp.work_type_id, wp.status, wp.is_archived,
         wt.workflow_template_id
    INTO v_permit
    FROM public.work_permits wp
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
    RAISE WARNING
      'ensure_permit_pending_approvals: permit % work_type % has NO workflow_template_id — no approval rows will be created. Assign a workflow template to this work type in the Workflow Builder.',
      p_permit_id, v_permit.work_type_id;
    RETURN 0;
  END IF;

  WITH step_list AS (
    SELECT
      ws.id AS step_id,
      ws.role_id,
      r.name AS role_name,
      ws.step_order,
      COALESCE(pwo.is_required, wtsc.is_required, ws.is_required_default, true) AS is_required
    FROM public.workflow_steps ws
    JOIN public.roles r ON r.id = ws.role_id
    LEFT JOIN public.permit_workflow_overrides pwo
      ON pwo.permit_id = p_permit_id AND pwo.workflow_step_id = ws.id
    LEFT JOIN public.work_type_step_config wtsc
      ON wtsc.work_type_id = v_permit.work_type_id AND wtsc.workflow_step_id = ws.id
    WHERE ws.workflow_template_id = v_wf_template AND r.name IS NOT NULL
  ),
  to_insert AS (
    INSERT INTO public.permit_approvals (permit_id, workflow_step_id, role_id, role_name, status)
    SELECT p_permit_id, sl.step_id, sl.role_id, sl.role_name, 'pending'
      FROM step_list sl
     WHERE sl.is_required = true
       AND NOT EXISTS (
         SELECT 1 FROM public.permit_approvals pa
          WHERE pa.permit_id = p_permit_id AND pa.role_name = sl.role_name
       )
    ON CONFLICT (permit_id, role_name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM to_insert;

  RAISE NOTICE 'ensure_permit_pending_approvals: permit % inserted % pending approval rows (workflow_template %)',
    p_permit_id, v_inserted, v_wf_template;
  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_contractor(
  p_name text,
  p_contact_person text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_trade text DEFAULT NULL::text,
  p_tenant_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_contact text := NULLIF(btrim(COALESCE(p_contact_person, '')), '');
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_email text := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_trade text := NULLIF(btrim(COALESCE(p_trade, '')), '');
  v_tenant uuid := COALESCE(p_tenant_id, auth.uid());
  v_service boolean := COALESCE(auth.role() = 'service_role', false);
BEGIN
  -- Validate before any insert, update, or tenant association.
  IF v_name = '' OR length(v_name) > 500
     OR length(v_contact) > 500 OR length(v_phone) > 100
     OR length(v_email) > 320 OR length(v_trade) > 500
     OR (v_name || COALESCE(v_contact, '') || COALESCE(v_phone, '') ||
         COALESCE(v_email, '') || COALESCE(v_trade, '')) ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'Invalid contractor input: a non-empty name and bounded printable fields are required'
      USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid contractor email' USING ERRCODE = '22023';
  END IF;

  IF v_tenant IS NOT NULL AND NOT v_service THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Anonymous contractor registration cannot link a tenant' USING ERRCODE = '42501';
    END IF;
    IF v_tenant <> auth.uid()
       AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
       AND NOT public.can_submit_on_behalf(auth.uid()) THEN
      RAISE EXCEPTION 'Cannot link a contractor to another tenant' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_id FROM public.contractors WHERE normalized_name = lower(v_name) LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.contractors (name, contact_person, phone, email, trade, created_by)
    VALUES (v_name, v_contact, v_phone, v_email, v_trade, auth.uid())
    RETURNING id INTO v_id;
  ELSIF auth.uid() IS NOT NULL OR v_service THEN
    -- Anonymous callers may register a contractor, not alter existing contact data.
    UPDATE public.contractors SET
      contact_person = COALESCE(contact_person, v_contact),
      phone = COALESCE(phone, v_phone),
      email = COALESCE(email, v_email),
      trade = COALESCE(trade, v_trade), updated_at = now()
    WHERE id = v_id;
  END IF;
  IF v_tenant IS NOT NULL THEN
    INSERT INTO public.tenant_contractors (tenant_id, contractor_id, usage_count, last_used_at)
    VALUES (v_tenant, v_id, 1, now())
    ON CONFLICT (tenant_id, contractor_id)
    DO UPDATE SET usage_count = public.tenant_contractors.usage_count + 1, last_used_at = now();
  END IF;
  RETURN v_id;
END;
$function$;