CREATE OR REPLACE FUNCTION public._trg_workflow_step_reassign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_template_id uuid;
  v_permit_id uuid;
BEGIN
  v_template_id := COALESCE(NEW.workflow_template_id, OLD.workflow_template_id);
  IF v_template_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  FOR v_permit_id IN
    SELECT wp.id FROM public.work_permits wp
    JOIN public.work_types wt ON wt.id = wp.work_type_id
    WHERE wt.workflow_template_id = v_template_id
      AND NOT COALESCE(wp.is_archived, false)
      AND wp.status NOT IN ('approved', 'rejected', 'cancelled', 'closed', 'draft')
  LOOP
    UPDATE public.permit_approvals pa SET status = 'skipped', updated_at = now()
    WHERE pa.permit_id = v_permit_id AND pa.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.workflow_steps ws2 JOIN public.roles r2 ON r2.id = ws2.role_id
        WHERE ws2.workflow_template_id = v_template_id AND r2.name = pa.role_name
      );
    -- The workflow write already passed its admin/service authorization.
    PERFORM public._ensure_permit_pending_approvals_internal(v_permit_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;