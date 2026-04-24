/**
 * useGatePassApprovals — reads from the new gate_pass_approvals table
 * populated by Phase 2b dual-write. Mirrors usePermitApprovals (Phase 2c-1).
 *
 * Shape intent is intentionally identical to usePermitApprovals so that
 * the display components look alike. The only extra field is `extra`
 * (JSONB) which holds role-specific side data — `cctv_confirmed` for
 * security role and `material_action` (in/out) for store manager.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type GatePassApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped';
export type GatePassApprovalAuthMethod = 'password' | 'webauthn';

export interface GatePassApproval {
  id: string;
  gate_pass_id: string;
  workflow_step_id: string | null;
  role_id: string | null;
  role_name: string;
  status: GatePassApprovalStatus;
  approver_user_id: string | null;
  approver_name: string | null;
  approver_email: string | null;
  approved_at: string | null;
  comments: string | null;
  signature: string | null;
  signature_hash: string | null;
  auth_method: GatePassApprovalAuthMethod | null;
  webauthn_credential_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useGatePassApprovals(gatePassId: string | undefined) {
  return useQuery({
    queryKey: ['gate-pass-approvals', gatePassId],
    enabled: !!gatePassId,
    queryFn: async (): Promise<GatePassApproval[]> => {
      if (!gatePassId) return [];

      const { data, error } = await supabase
        .from('gate_pass_approvals')
        .select(`
          id, gate_pass_id, workflow_step_id, role_id, role_name, status,
          approver_user_id, approver_name, approver_email, approved_at,
          comments, signature, signature_hash,
          auth_method, webauthn_credential_id,
          ip_address, user_agent, device_info, extra,
          created_at, updated_at,
          workflow_steps ( step_order )
        `)
        .eq('gate_pass_id', gatePassId);

      if (error) throw error;

      type RowWithJoin = GatePassApproval & {
        workflow_steps?: { step_order?: number | null } | null;
      };
      const rows = (data as RowWithJoin[] | null) ?? [];

      rows.sort((a, b) => {
        const orderA = a.workflow_steps?.step_order ?? Number.POSITIVE_INFINITY;
        const orderB = b.workflow_steps?.step_order ?? Number.POSITIVE_INFINITY;
        if (orderA !== orderB) return orderA - orderB;
        return a.role_name.localeCompare(b.role_name);
      });

      return rows.map(({ workflow_steps: _drop, ...row }) => row);
    },
  });
}

/**
 * CCTV confirmation lives in `extra.cctv_confirmed` for the security role.
 * Small helper so the display component doesn't have to know the shape.
 */
export function cctvConfirmed(approval: GatePassApproval | null | undefined): boolean {
  if (!approval?.extra) return false;
  return approval.extra.cctv_confirmed === true;
}

/**
 * Material action (`in` or `out`) lives in `extra.material_action` for
 * the store_manager role.
 */
export function materialAction(approval: GatePassApproval | null | undefined): string | null {
  if (!approval?.extra) return null;
  const val = approval.extra.material_action;
  return typeof val === 'string' ? val : null;
}
