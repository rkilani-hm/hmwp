-- =============================================================================
-- Phase 2b backfill — populate permit_approvals and gate_pass_approvals from
-- existing hardcoded per-role columns on work_permits and gate_passes.
--
-- Safe to run multiple times. Uses ON CONFLICT DO NOTHING on the UNIQUE
-- (permit_id, role_name) / (gate_pass_id, role_name) constraint so reruns
-- do not duplicate rows or overwrite dual-write data that has landed since
-- the last run.
--
-- The earlier Phase 2a migration had a backfill section using jsonb-based
-- dynamic access that Lovable stripped when recreating the migrations. This
-- migration restores that backfill explicitly and runs idempotently.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permits
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  _roles text[] := ARRAY[
    'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout',
    'soft_facilities', 'hard_facilities', 'pm_service',
    'customer_service', 'cr_coordinator', 'head_cr',
    'ecovert_supervisor', 'pmd_coordinator', 'fmsp_approval'
  ];
  _role text;
  _permit record;
  _j jsonb;
  _status text;
  _approver_name text;
  _approver_email text;
  _date timestamptz;
  _comments text;
  _signature text;
BEGIN
  FOR _permit IN SELECT * FROM public.work_permits LOOP
    _j := to_jsonb(_permit);
    FOREACH _role IN ARRAY _roles LOOP
      _status := _j ->> (_role || '_status');
      -- Only backfill rows where an approval actually happened (approved/rejected)
      IF _status IS NULL OR _status NOT IN ('approved', 'rejected') THEN
        CONTINUE;
      END IF;
      _approver_name  := _j ->> (_role || '_approver_name');
      _approver_email := _j ->> (_role || '_approver_email');
      _date           := (_j ->> (_role || '_date'))::timestamptz;
      _comments       := _j ->> (_role || '_comments');
      _signature      := _j ->> (_role || '_signature');

      INSERT INTO public.permit_approvals (
        permit_id, role_name, status,
        approver_name, approver_email, approved_at,
        comments, signature,
        auth_method
      ) VALUES (
        _permit.id, _role, _status,
        _approver_name, _approver_email, _date,
        _comments, _signature,
        -- All historical approvals predate WebAuthn, so mark them password
        'password'
      )
      ON CONFLICT (permit_id, role_name) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Gate passes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  _roles text[] := ARRAY[
    'store_manager', 'finance', 'security',
    'security_pmd', 'cr_coordinator', 'head_cr', 'hm_security_pmd'
  ];
  _role text;
  _gp record;
  _j jsonb;
  _approver_name text;
  _date timestamptz;
  _comments text;
  _signature text;
  _extra jsonb;
BEGIN
  FOR _gp IN SELECT * FROM public.gate_passes LOOP
    _j := to_jsonb(_gp);
    FOREACH _role IN ARRAY _roles LOOP
      _approver_name := _j ->> (_role || '_name');
      _date          := (_j ->> (_role || '_date'))::timestamptz;
      -- Only backfill rows where an approval actually happened
      IF _approver_name IS NULL OR _date IS NULL THEN
        CONTINUE;
      END IF;
      _comments  := _j ->> (_role || '_comments');
      _signature := _j ->> (_role || '_signature');

      _extra := '{}'::jsonb;
      IF _role = 'security' AND (_j ->> 'security_cctv_confirmed')::boolean IS NOT NULL THEN
        _extra := _extra || jsonb_build_object('cctv_confirmed', (_j ->> 'security_cctv_confirmed')::boolean);
      END IF;
      IF _role IN ('security_pmd', 'hm_security_pmd') AND (_j ->> (_role || '_material_action')) IS NOT NULL THEN
        _extra := _extra || jsonb_build_object('material_action', _j ->> (_role || '_material_action'));
      END IF;

      INSERT INTO public.gate_pass_approvals (
        gate_pass_id, role_name, status,
        approver_name, approved_at,
        comments, signature,
        auth_method, extra
      ) VALUES (
        _gp.id, _role, 'approved',
        _approver_name, _date,
        _comments, _signature,
        'password', _extra
      )
      ON CONFLICT (gate_pass_id, role_name) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Reconcile function — callable manually to repair drift for one permit
-- or gate pass if dual-write drops a row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_permit_approvals(_permit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _roles text[] := ARRAY[
    'helpdesk', 'pm', 'pd', 'bdcr', 'mpr', 'it', 'fitout',
    'soft_facilities', 'hard_facilities', 'pm_service',
    'customer_service', 'cr_coordinator', 'head_cr',
    'ecovert_supervisor', 'pmd_coordinator', 'fmsp_approval'
  ];
  _role text;
  _permit record;
  _j jsonb;
  _status text;
BEGIN
  SELECT * INTO _permit FROM public.work_permits WHERE id = _permit_id;
  IF _permit IS NULL THEN RETURN; END IF;
  _j := to_jsonb(_permit);
  FOREACH _role IN ARRAY _roles LOOP
    _status := _j ->> (_role || '_status');
    IF _status IS NULL OR _status NOT IN ('approved', 'rejected') THEN CONTINUE; END IF;
    INSERT INTO public.permit_approvals (
      permit_id, role_name, status,
      approver_name, approver_email, approved_at,
      comments, signature, auth_method
    ) VALUES (
      _permit.id, _role, _status,
      _j ->> (_role || '_approver_name'),
      _j ->> (_role || '_approver_email'),
      (_j ->> (_role || '_date'))::timestamptz,
      _j ->> (_role || '_comments'),
      _j ->> (_role || '_signature'),
      'password'
    )
    ON CONFLICT (permit_id, role_name) DO UPDATE SET
      status          = EXCLUDED.status,
      approver_name   = COALESCE(public.permit_approvals.approver_name,  EXCLUDED.approver_name),
      approver_email  = COALESCE(public.permit_approvals.approver_email, EXCLUDED.approver_email),
      approved_at     = COALESCE(public.permit_approvals.approved_at,    EXCLUDED.approved_at),
      comments        = COALESCE(public.permit_approvals.comments,       EXCLUDED.comments),
      signature       = COALESCE(public.permit_approvals.signature,      EXCLUDED.signature);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.reconcile_permit_approvals(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_gate_pass_approvals(_gate_pass_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _roles text[] := ARRAY[
    'store_manager', 'finance', 'security',
    'security_pmd', 'cr_coordinator', 'head_cr', 'hm_security_pmd'
  ];
  _role text;
  _gp record;
  _j jsonb;
  _approver_name text;
  _date timestamptz;
BEGIN
  SELECT * INTO _gp FROM public.gate_passes WHERE id = _gate_pass_id;
  IF _gp IS NULL THEN RETURN; END IF;
  _j := to_jsonb(_gp);
  FOREACH _role IN ARRAY _roles LOOP
    _approver_name := _j ->> (_role || '_name');
    _date          := (_j ->> (_role || '_date'))::timestamptz;
    IF _approver_name IS NULL OR _date IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.gate_pass_approvals (
      gate_pass_id, role_name, status,
      approver_name, approved_at,
      comments, signature, auth_method
    ) VALUES (
      _gp.id, _role, 'approved',
      _approver_name, _date,
      _j ->> (_role || '_comments'),
      _j ->> (_role || '_signature'),
      'password'
    )
    ON CONFLICT (gate_pass_id, role_name) DO UPDATE SET
      approver_name = COALESCE(public.gate_pass_approvals.approver_name, EXCLUDED.approver_name),
      approved_at   = COALESCE(public.gate_pass_approvals.approved_at,   EXCLUDED.approved_at),
      comments      = COALESCE(public.gate_pass_approvals.comments,      EXCLUDED.comments),
      signature     = COALESCE(public.gate_pass_approvals.signature,     EXCLUDED.signature);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.reconcile_gate_pass_approvals(uuid) TO authenticated;
