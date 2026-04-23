-- Migration 2/3: Extend signature_audit_logs to gate passes
ALTER TABLE public.signature_audit_logs
  ADD COLUMN IF NOT EXISTS gate_pass_id uuid REFERENCES public.gate_passes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_signature_audit_logs_gate_pass_id
  ON public.signature_audit_logs(gate_pass_id);

CREATE POLICY "Approvers can view signature logs for gate passes"
  ON public.signature_audit_logs FOR SELECT
  USING (
    gate_pass_id IS NOT NULL
    AND public.is_gate_pass_approver(auth.uid())
  );

CREATE POLICY "Users can view signature logs for own gate passes"
  ON public.signature_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gate_passes gp
      WHERE gp.id = signature_audit_logs.gate_pass_id
        AND gp.requester_id = auth.uid()
    )
  );