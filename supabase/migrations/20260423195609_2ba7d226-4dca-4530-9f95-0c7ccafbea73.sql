-- Migration 3/3: Approvals tables (additive)
CREATE TABLE IF NOT EXISTS public.permit_approvals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id               uuid NOT NULL REFERENCES public.work_permits(id) ON DELETE CASCADE,
  workflow_step_id        uuid REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  role_id                 uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  role_name               text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  approver_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_name           text,
  approver_email          text,
  approved_at             timestamptz,
  comments                text,
  signature               text,
  signature_hash          text,
  auth_method             text CHECK (auth_method IN ('password', 'webauthn', NULL)),
  webauthn_credential_id  uuid REFERENCES public.webauthn_credentials(id) ON DELETE SET NULL,
  ip_address              text,
  user_agent              text,
  device_info             jsonb DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, role_name)
);

CREATE INDEX IF NOT EXISTS permit_approvals_permit_id_idx ON public.permit_approvals(permit_id);
CREATE INDEX IF NOT EXISTS permit_approvals_status_idx ON public.permit_approvals(permit_id, status);
CREATE INDEX IF NOT EXISTS permit_approvals_role_pending_idx ON public.permit_approvals(role_name) WHERE status = 'pending';

ALTER TABLE public.permit_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters can view their permit approvals"
  ON public.permit_approvals FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.work_permits wp WHERE wp.id = permit_approvals.permit_id AND wp.requester_id = auth.uid()));

CREATE POLICY "Approvers can view all permit approvals"
  ON public.permit_approvals FOR SELECT
  USING (public.is_approver(auth.uid()));

CREATE POLICY "Admins can delete permit approvals"
  ON public.permit_approvals FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER permit_approvals_updated_at
  BEFORE UPDATE ON public.permit_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.gate_pass_approvals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_pass_id            uuid NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
  workflow_step_id        uuid REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  role_id                 uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  role_name               text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  approver_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_name           text,
  approver_email          text,
  approved_at             timestamptz,
  comments                text,
  signature               text,
  signature_hash          text,
  auth_method             text CHECK (auth_method IN ('password', 'webauthn', NULL)),
  webauthn_credential_id  uuid REFERENCES public.webauthn_credentials(id) ON DELETE SET NULL,
  ip_address              text,
  user_agent              text,
  device_info             jsonb DEFAULT '{}'::jsonb,
  extra                   jsonb DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gate_pass_id, role_name)
);

CREATE INDEX IF NOT EXISTS gate_pass_approvals_gate_pass_id_idx ON public.gate_pass_approvals(gate_pass_id);
CREATE INDEX IF NOT EXISTS gate_pass_approvals_status_idx ON public.gate_pass_approvals(gate_pass_id, status);

ALTER TABLE public.gate_pass_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters can view their gate pass approvals"
  ON public.gate_pass_approvals FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.gate_passes gp WHERE gp.id = gate_pass_approvals.gate_pass_id AND gp.requester_id = auth.uid()));

CREATE POLICY "Approvers can view all gate pass approvals"
  ON public.gate_pass_approvals FOR SELECT
  USING (public.is_gate_pass_approver(auth.uid()));

CREATE POLICY "Admins can delete gate pass approvals"
  ON public.gate_pass_approvals FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER gate_pass_approvals_updated_at
  BEFORE UPDATE ON public.gate_pass_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  r_permit RECORD;
  r_json JSONB;
  v_role TEXT;
  v_roles TEXT[] := ARRAY['helpdesk','pm','pd','bdcr','mpr','it','fitout','soft_facilities','hard_facilities','pm_service','customer_service','cr_coordinator','head_cr','ecovert_supervisor','pmd_coordinator','fmsp_approval'];
  v_status TEXT; v_name TEXT; v_email TEXT; v_date TIMESTAMPTZ; v_comments TEXT; v_signature TEXT; v_role_id UUID;
BEGIN
  FOR r_permit IN SELECT * FROM public.work_permits LOOP
    r_json := to_jsonb(r_permit);
    FOREACH v_role IN ARRAY v_roles LOOP
      v_status := r_json ->> (v_role || '_status');
      v_name := r_json ->> (v_role || '_approver_name');
      v_email := r_json ->> (v_role || '_approver_email');
      v_date := NULLIF(r_json ->> (v_role || '_date'), '')::timestamptz;
      v_comments := r_json ->> (v_role || '_comments');
      v_signature := r_json ->> (v_role || '_signature');
      IF v_status IS NULL OR (v_status = 'pending' AND v_date IS NULL AND v_signature IS NULL) THEN CONTINUE; END IF;
      SELECT id INTO v_role_id FROM public.roles WHERE name = v_role;
      INSERT INTO public.permit_approvals (permit_id, role_id, role_name, status, approver_name, approver_email, approved_at, comments, signature)
      VALUES (r_permit.id, v_role_id, v_role,
        CASE WHEN v_status IN ('approved','rejected','pending','skipped') THEN v_status ELSE 'pending' END,
        v_name, v_email, v_date, v_comments, v_signature)
      ON CONFLICT (permit_id, role_name) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  r_pass RECORD; r_json JSONB; v_role TEXT;
  v_roles TEXT[] := ARRAY['store_manager','finance','security','security_pmd','cr_coordinator','head_cr','hm_security_pmd'];
  v_name TEXT; v_date TIMESTAMPTZ; v_comments TEXT; v_signature TEXT; v_material_action TEXT; v_role_id UUID; v_extra JSONB;
BEGIN
  FOR r_pass IN SELECT * FROM public.gate_passes LOOP
    r_json := to_jsonb(r_pass);
    FOREACH v_role IN ARRAY v_roles LOOP
      v_name := r_json ->> (v_role || '_name');
      v_date := NULLIF(r_json ->> (v_role || '_date'), '')::timestamptz;
      v_comments := r_json ->> (v_role || '_comments');
      v_signature := r_json ->> (v_role || '_signature');
      IF v_name IS NULL AND v_date IS NULL AND v_signature IS NULL THEN CONTINUE; END IF;
      SELECT id INTO v_role_id FROM public.roles WHERE name = v_role;
      v_extra := '{}'::jsonb;
      IF v_role = 'security' THEN
        v_extra := v_extra || jsonb_build_object('cctv_confirmed', COALESCE((r_json ->> 'security_cctv_confirmed')::boolean, false));
      END IF;
      IF v_role IN ('security_pmd','hm_security_pmd') THEN
        v_material_action := r_json ->> (v_role || '_material_action');
        IF v_material_action IS NOT NULL THEN
          v_extra := v_extra || jsonb_build_object('material_action', v_material_action);
        END IF;
      END IF;
      INSERT INTO public.gate_pass_approvals (gate_pass_id, role_id, role_name, status, approver_name, approved_at, comments, signature, extra)
      VALUES (r_pass.id, v_role_id, v_role,
        CASE WHEN v_date IS NOT NULL THEN 'approved' ELSE 'pending' END,
        v_name, v_date, v_comments, v_signature, v_extra)
      ON CONFLICT (gate_pass_id, role_name) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.permit_pending_approvals AS
SELECT pa.*, wp.permit_no, wp.requester_name, wp.status AS permit_status, wp.sla_deadline, wp.urgency
FROM public.permit_approvals pa
JOIN public.work_permits wp ON wp.id = pa.permit_id
WHERE pa.status = 'pending' AND NOT COALESCE(wp.is_archived, false);

CREATE OR REPLACE VIEW public.gate_pass_pending_approvals AS
SELECT ga.*, gp.pass_no, gp.requester_name, gp.status AS pass_status, gp.pass_type, gp.has_high_value_asset
FROM public.gate_pass_approvals ga
JOIN public.gate_passes gp ON gp.id = ga.gate_pass_id
WHERE ga.status = 'pending' AND NOT COALESCE(gp.is_archived, false);

GRANT SELECT ON public.permit_pending_approvals TO authenticated;
GRANT SELECT ON public.gate_pass_pending_approvals TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_permit_approvals(_permit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r_permit RECORD; r_json JSONB; v_role TEXT;
  v_roles TEXT[] := ARRAY['helpdesk','pm','pd','bdcr','mpr','it','fitout','soft_facilities','hard_facilities','pm_service','customer_service','cr_coordinator','head_cr','ecovert_supervisor','pmd_coordinator','fmsp_approval'];
  v_status TEXT; v_name TEXT; v_email TEXT; v_date TIMESTAMPTZ; v_comments TEXT; v_signature TEXT; v_role_id UUID;
BEGIN
  SELECT * INTO r_permit FROM public.work_permits WHERE id = _permit_id;
  IF NOT FOUND THEN RETURN; END IF;
  r_json := to_jsonb(r_permit);
  FOREACH v_role IN ARRAY v_roles LOOP
    v_status := r_json ->> (v_role || '_status');
    v_name := r_json ->> (v_role || '_approver_name');
    v_email := r_json ->> (v_role || '_approver_email');
    v_date := NULLIF(r_json ->> (v_role || '_date'), '')::timestamptz;
    v_comments := r_json ->> (v_role || '_comments');
    v_signature := r_json ->> (v_role || '_signature');
    IF v_status IS NULL OR (v_status = 'pending' AND v_date IS NULL AND v_signature IS NULL) THEN CONTINUE; END IF;
    SELECT id INTO v_role_id FROM public.roles WHERE name = v_role;
    INSERT INTO public.permit_approvals (permit_id, role_id, role_name, status, approver_name, approver_email, approved_at, comments, signature)
    VALUES (_permit_id, v_role_id, v_role,
      CASE WHEN v_status IN ('approved','rejected','pending','skipped') THEN v_status ELSE 'pending' END,
      v_name, v_email, v_date, v_comments, v_signature)
    ON CONFLICT (permit_id, role_name) DO UPDATE SET
      status = EXCLUDED.status, approver_name = EXCLUDED.approver_name,
      approver_email = EXCLUDED.approver_email, approved_at = EXCLUDED.approved_at,
      comments = EXCLUDED.comments, signature = EXCLUDED.signature, updated_at = now();
  END LOOP;
END $$;