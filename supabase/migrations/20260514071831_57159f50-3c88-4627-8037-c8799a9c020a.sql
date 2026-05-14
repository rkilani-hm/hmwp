BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals(p_permit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_permit record;
  v_wf_template uuid;
BEGIN
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
      ws.id     AS step_id,
      ws.role_id,
      r.name    AS role_name,
      ws.step_order,
      COALESCE(
        pwo.is_required,
        wtsc.is_required,
        ws.is_required_default,
        true
      ) AS is_required
    FROM public.workflow_steps ws
    JOIN public.roles r ON r.id = ws.role_id
    LEFT JOIN public.permit_workflow_overrides pwo
      ON pwo.permit_id = p_permit_id AND pwo.workflow_step_id = ws.id
    LEFT JOIN public.work_type_step_config wtsc
      ON wtsc.work_type_id = v_permit.work_type_id
     AND wtsc.workflow_step_id = ws.id
    WHERE ws.workflow_template_id = v_wf_template
      AND r.name IS NOT NULL
  ),
  to_insert AS (
    INSERT INTO public.permit_approvals (
      permit_id, workflow_step_id, role_id, role_name, status
    )
    SELECT p_permit_id, sl.step_id, sl.role_id, sl.role_name, 'pending'
      FROM step_list sl
     WHERE sl.is_required = true
       AND NOT EXISTS (
         SELECT 1 FROM public.permit_approvals pa
          WHERE pa.permit_id = p_permit_id
            AND pa.role_name = sl.role_name
       )
    ON CONFLICT (permit_id, role_name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM to_insert;

  RAISE NOTICE
    'ensure_permit_pending_approvals: permit % inserted % pending approval rows (workflow_template %)',
    p_permit_id, v_inserted, v_wf_template;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_permit_pending_approvals(uuid)
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.reassign_permit_approvals(p_permit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_admin boolean;
  v_permit       record;
  v_wf_template  uuid;
  v_skipped      integer := 0;
  v_inserted     integer := 0;
  v_active_roles text[];
  v_new_status   text;
  v_old_status   text;
  v_status_changed boolean := false;
  v_caller_name  text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF NOT v_caller_admin THEN
    RAISE EXCEPTION 'permission denied — admin role required to reassign approvals';
  END IF;

  SELECT wp.id, wp.permit_no, wp.work_type_id, wp.status, wp.is_archived,
         wt.workflow_template_id
    INTO v_permit
    FROM public.work_permits wp
    LEFT JOIN public.work_types wt ON wt.id = wp.work_type_id
   WHERE wp.id = p_permit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'permit not found: %', p_permit_id;
  END IF;

  IF COALESCE(v_permit.is_archived, false) THEN
    RAISE EXCEPTION 'permit is archived';
  END IF;

  v_old_status  := v_permit.status::text;
  v_wf_template := v_permit.workflow_template_id;

  IF v_wf_template IS NULL THEN
    RAISE EXCEPTION
      'work_type % has no workflow_template — cannot reassign. Assign a template in Workflow Builder first.',
      v_permit.work_type_id;
  END IF;

  UPDATE public.permit_approvals pa
     SET status = 'skipped',
         updated_at = now()
   WHERE pa.permit_id = p_permit_id
     AND pa.status = 'pending'
     AND NOT EXISTS (
       SELECT 1
         FROM public.workflow_steps ws
         JOIN public.roles r ON r.id = ws.role_id
        WHERE ws.workflow_template_id = v_wf_template
          AND r.name = pa.role_name
     );
  GET DIAGNOSTICS v_skipped = ROW_COUNT;

  v_inserted := public.ensure_permit_pending_approvals(p_permit_id);

  SELECT array_agg(role_name ORDER BY step_order)
    INTO v_active_roles
    FROM public.permit_active_approvers
   WHERE permit_id = p_permit_id;

  IF v_active_roles IS NOT NULL AND array_length(v_active_roles, 1) > 0 THEN
    v_new_status := 'pending_' || v_active_roles[1];
    IF v_new_status <> v_old_status THEN
      BEGIN
        UPDATE public.work_permits
           SET status = v_new_status::permit_status,
               updated_at = now()
         WHERE id = p_permit_id;
        v_status_changed := true;
      EXCEPTION WHEN invalid_text_representation OR check_violation THEN
        RAISE NOTICE 'enum value % not found; falling back to under_review', v_new_status;
        UPDATE public.work_permits
           SET status = 'under_review'::permit_status,
               updated_at = now()
         WHERE id = p_permit_id;
        v_new_status := 'under_review';
        v_status_changed := true;
      END;
    END IF;
  END IF;

  SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = v_caller_id;

  INSERT INTO public.activity_logs (
    permit_id, action, performed_by, performed_by_id, details
  )
  VALUES (
    p_permit_id,
    'Reassigned',
    COALESCE(v_caller_name, 'Admin'),
    v_caller_id,
    format(
      'Workflow reassignment: skipped %s stale pending row(s), inserted %s new pending row(s). Active role(s): %s',
      v_skipped, v_inserted,
      COALESCE(array_to_string(v_active_roles, ', '), '(none — terminal)')
    )
  );

  RETURN jsonb_build_object(
    'permit_id',       p_permit_id,
    'permit_no',       v_permit.permit_no,
    'skipped_count',   v_skipped,
    'inserted_count',  v_inserted,
    'active_roles',    to_jsonb(v_active_roles),
    'old_status',      v_old_status,
    'new_status',      COALESCE(v_new_status, v_old_status),
    'status_changed',  v_status_changed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_permit_approvals(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.reassign_permit_approvals(uuid) IS
  'Reconcile a single permit against the current workflow. Skips '
  'pending rows for roles no longer in the workflow, inserts rows for '
  'required roles missing from the permit, recomputes status. Admin only.';

CREATE OR REPLACE FUNCTION public.reassign_all_active_permits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_admin boolean;
  v_results      jsonb := '[]'::jsonb;
  v_permit       record;
  v_result       jsonb;
  v_processed    integer := 0;
  v_changed      integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_caller_id AND r.name = 'admin'
  ) INTO v_caller_admin;

  IF NOT v_caller_admin THEN
    RAISE EXCEPTION 'permission denied — admin role required';
  END IF;

  FOR v_permit IN
    SELECT id
      FROM public.work_permits
     WHERE NOT COALESCE(is_archived, false)
       AND status NOT IN ('approved', 'rejected', 'cancelled', 'closed', 'draft')
     ORDER BY created_at DESC
  LOOP
    BEGIN
      v_result := public.reassign_permit_approvals(v_permit.id);
      v_results := v_results || jsonb_build_array(v_result);
      v_processed := v_processed + 1;

      IF (v_result ->> 'status_changed')::boolean
         OR (v_result ->> 'skipped_count')::int > 0
         OR (v_result ->> 'inserted_count')::int > 0
      THEN
        v_changed := v_changed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'permit_id', v_permit.id,
          'error', SQLERRM
        )
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed_count', v_processed,
    'changed_count',   v_changed,
    'results',         v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_all_active_permits()
  TO authenticated;

COMMENT ON FUNCTION public.reassign_all_active_permits() IS
  'Reconcile EVERY non-terminal permit against the current workflow '
  'configuration. Returns per-permit results. Admin only.';

CREATE OR REPLACE FUNCTION public._trg_workflow_step_reassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
  v_permit_id   uuid;
BEGIN
  v_template_id := COALESCE(NEW.workflow_template_id, OLD.workflow_template_id);
  IF v_template_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_permit_id IN
    SELECT wp.id
      FROM public.work_permits wp
      JOIN public.work_types wt ON wt.id = wp.work_type_id
     WHERE wt.workflow_template_id = v_template_id
       AND NOT COALESCE(wp.is_archived, false)
       AND wp.status NOT IN ('approved', 'rejected', 'cancelled', 'closed', 'draft')
  LOOP
    UPDATE public.permit_approvals pa
       SET status = 'skipped',
           updated_at = now()
     WHERE pa.permit_id = v_permit_id
       AND pa.status = 'pending'
       AND NOT EXISTS (
         SELECT 1
           FROM public.workflow_steps ws2
           JOIN public.roles r2 ON r2.id = ws2.role_id
          WHERE ws2.workflow_template_id = v_template_id
            AND r2.name = pa.role_name
       );

    PERFORM public.ensure_permit_pending_approvals(v_permit_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS workflow_steps_reassign_active_permits ON public.workflow_steps;
CREATE TRIGGER workflow_steps_reassign_active_permits
  AFTER INSERT OR UPDATE OR DELETE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_workflow_step_reassign();

COMMENT ON TRIGGER workflow_steps_reassign_active_permits ON public.workflow_steps IS
  'When admin edits the workflow_steps for a template, all active '
  'permits using that template have their permit_approvals reconciled '
  'automatically. Future workflow changes propagate without manual '
  'reassignment.';

DROP TRIGGER IF EXISTS work_permits_ensure_pending ON public.work_permits;
CREATE TRIGGER work_permits_ensure_pending
  AFTER INSERT OR UPDATE OF status, work_type_id ON public.work_permits
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM 'draft' AND NEW.status IS NOT NULL)
  EXECUTE FUNCTION public._trg_permit_ensure_pending();

COMMIT;

NOTIFY pgrst, 'reload schema';