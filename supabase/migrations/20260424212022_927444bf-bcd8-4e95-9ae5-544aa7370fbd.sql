-- Phase 2c-5a: Populate pending rows in permit_approvals
-- Idempotent, additive. No frontend or edge function changes.

CREATE OR REPLACE FUNCTION public.ensure_permit_pending_approvals(_permit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _permit         record;
  _wt             record;
  _step           record;
  _role_name      text;
  _required       boolean;
  _override       boolean;
  _wt_cfg         boolean;
  _legacy_col     text;
  _legacy_val     boolean;
  _wt_json        jsonb;
  _inserted       integer := 0;
BEGIN
  SELECT * INTO _permit FROM public.work_permits WHERE id = _permit_id;
  IF _permit IS NULL THEN RETURN 0; END IF;
  IF COALESCE(_permit.is_archived, false) THEN RETURN 0; END IF;
  IF _permit.status IS NULL OR _permit.status::text = 'draft' THEN RETURN 0; END IF;
  IF _permit.work_type_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _wt FROM public.work_types WHERE id = _permit.work_type_id;
  IF _wt IS NULL OR _wt.workflow_template_id IS NULL THEN RETURN 0; END IF;

  _wt_json := to_jsonb(_wt);

  FOR _step IN
    SELECT ws.id            AS step_id,
           ws.role_id       AS role_id,
           ws.is_required_default,
           r.name           AS role_name
      FROM public.workflow_steps ws
      JOIN public.roles r ON r.id = ws.role_id
     WHERE ws.workflow_template_id = _wt.workflow_template_id
     ORDER BY ws.step_order
  LOOP
    _role_name := _step.role_name;

    -- 1. permit_workflow_overrides
    SELECT pwo.is_required INTO _override
      FROM public.permit_workflow_overrides pwo
     WHERE pwo.permit_id = _permit_id
       AND pwo.workflow_step_id = _step.step_id
     LIMIT 1;

    IF _override IS NOT NULL THEN
      _required := _override;
    ELSE
      -- 2. work_type_step_config
      SELECT wtc.is_required INTO _wt_cfg
        FROM public.work_type_step_config wtc
       WHERE wtc.work_type_id = _permit.work_type_id
         AND wtc.workflow_step_id = _step.step_id
       LIMIT 1;

      IF _wt_cfg IS NOT NULL THEN
        _required := _wt_cfg;
      ELSIF _step.is_required_default IS NOT NULL THEN
        -- 3. workflow_steps default
        _required := _step.is_required_default;
      ELSE
        -- 4. legacy work_types.requires_<role_name>
        _legacy_col := 'requires_' || _role_name;
        IF _wt_json ? _legacy_col THEN
          _legacy_val := (_wt_json ->> _legacy_col)::boolean;
          _required := COALESCE(_legacy_val, true);
        ELSE
          _required := true;
        END IF;
      END IF;
    END IF;

    IF NOT _required THEN
      CONTINUE;
    END IF;

    -- Insert pending only if no row exists for this (permit, role)
    INSERT INTO public.permit_approvals (
      permit_id, role_name, role_id, workflow_step_id, status
    )
    SELECT _permit_id, _role_name, _step.role_id, _step.step_id, 'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.permit_approvals pa
       WHERE pa.permit_id = _permit_id
         AND pa.role_name = _role_name
    );

    IF FOUND THEN
      _inserted := _inserted + 1;
    END IF;
  END LOOP;

  RETURN _inserted;
END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public._trg_permit_ensure_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_permit_pending_approvals(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_permits_ensure_pending ON public.work_permits;

CREATE TRIGGER work_permits_ensure_pending
AFTER INSERT OR UPDATE OF status ON public.work_permits
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM 'draft'::permit_status AND NEW.status IS NOT NULL)
EXECUTE FUNCTION public._trg_permit_ensure_pending();

-- Backfill loop
DO $$
DECLARE
  _p record;
BEGIN
  FOR _p IN
    SELECT id FROM public.work_permits
     WHERE NOT COALESCE(is_archived, false)
       AND status IS NOT NULL
       AND status::text <> 'draft'
  LOOP
    PERFORM public.ensure_permit_pending_approvals(_p.id);
  END LOOP;
END $$;