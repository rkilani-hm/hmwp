-- =============================================================================
-- Phase 1b: extend signature_audit_logs to cover gate passes
--
-- signature_audit_logs already allows permit_id to be NULL, so we can add a
-- nullable gate_pass_id column and use the same table for both permit and
-- gate pass approvals.
-- =============================================================================

ALTER TABLE public.signature_audit_logs
  ADD COLUMN IF NOT EXISTS gate_pass_id uuid REFERENCES public.gate_passes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_signature_audit_logs_gate_pass_id
  ON public.signature_audit_logs(gate_pass_id);

-- Allow approvers to see audit logs for gate passes too (mirrors permit logic)
CREATE POLICY "Approvers can view signature logs for gate passes"
  ON public.signature_audit_logs FOR SELECT
  USING (
    gate_pass_id IS NOT NULL
    AND public.is_gate_pass_approver(auth.uid())
  );

-- Gate pass requesters can view their own signature logs
CREATE POLICY "Users can view signature logs for own gate passes"
  ON public.signature_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gate_passes gp
      WHERE gp.id = signature_audit_logs.gate_pass_id
        AND gp.requester_id = auth.uid()
    )
  );
