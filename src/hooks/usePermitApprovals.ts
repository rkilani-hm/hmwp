/**
 * usePermitApprovals — reads from the new permit_approvals table
 * introduced in Phase 2a and kept in sync by the Phase 2b dual-write.
 *
 * This is a READ-ONLY scaffold (Phase 2c-1). Nothing in the existing
 * app depends on it yet. Phase 2c-2 will switch PermitDetail to use
 * it, then 2c-3 does PDF + email, 2c-4 does inbox + gate pass. Legacy
 * per-role columns remain the source of truth until 2c-5 drops them.
 *
 * Shape intent:
 *   - Returns the full set of approval rows for a permit (one per role),
 *     ordered by the workflow step ordering when available, falling
 *     back to a stable name-alphabetical sort so the UI never jitters.
 *   - `status` is authoritative from the new table. `approver_name` /
 *     `approved_at` / `signature` / `comments` come from whatever the
 *     dual-write wrote.
 *   - Returns empty array (not null) when a permit has no approvals
 *     recorded yet — simpler component code.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PermitApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped';
export type PermitApprovalAuthMethod = 'password' | 'webauthn';

export interface PermitApproval {
  id: string;
  permit_id: string;
  workflow_step_id: string | null;
  role_id: string | null;
  role_name: string;
  status: PermitApprovalStatus;
  approver_user_id: string | null;
  approver_name: string | null;
  approver_email: string | null;
  approved_at: string | null;
  comments: string | null;
  signature: string | null;
  signature_hash: string | null;
  auth_method: PermitApprovalAuthMethod | null;
  webauthn_credential_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Legacy permit-status column name for a given role. Useful during
 * Phase 2c rollout when a component might want to compare what the
 * new table says against the old columns for drift detection.
 */
export function legacyStatusColumnFor(roleName: string): string {
  return `${roleName}_status`;
}

export function usePermitApprovals(permitId: string | undefined) {
  return useQuery({
    queryKey: ['permit-approvals', permitId],
    enabled: !!permitId,
    queryFn: async (): Promise<PermitApproval[]> => {
      if (!permitId) return [];

      // Join workflow_steps to get the step_order so the UI can render
      // approvals in the right sequence. Not every row has a
      // workflow_step_id (legacy backfilled rows are fine without one),
      // so we select it as a nullable left-join and sort with a fallback.
      const { data, error } = await supabase
        .from('permit_approvals')
        .select(`
          id, permit_id, workflow_step_id, role_id, role_name, status,
          approver_user_id, approver_name, approver_email, approved_at,
          comments, signature, signature_hash,
          auth_method, webauthn_credential_id,
          ip_address, user_agent, device_info,
          created_at, updated_at,
          workflow_steps ( step_order )
        `)
        .eq('permit_id', permitId);

      if (error) throw error;

      type RowWithJoin = PermitApproval & {
        workflow_steps?: { step_order?: number | null } | null;
      };
      const rows = (data as RowWithJoin[] | null) ?? [];

      // Sort: by workflow step_order when present, then role_name
      // alphabetically as a stable tiebreak. Rows without a step go
      // to the end.
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
 * Derive the "current role" that needs to act, if any. Useful when a
 * component wants to know "who is this permit waiting on right now?"
 * without recomputing it from scratch.
 *
 * Returns null if the permit has no pending approvals (fully approved,
 * rejected, or no approvals rows yet).
 */
export function currentPendingRole(approvals: PermitApproval[]): string | null {
  const firstPending = approvals.find((a) => a.status === 'pending');
  return firstPending?.role_name ?? null;
}
