/**
 * useEntityApprovals — entity-parameterized merge of usePermitApprovals and
 * useGatePassApprovals (audit item D1). Both read from a per-entity approvals
 * table (permit_approvals / gate_pass_approvals) populated by the Phase 2b
 * dual-write, one row per role, sorted by workflow step order with a stable
 * name-alphabetical tiebreak.
 *
 * The two entities differ in exactly one column: gate passes carry an extra
 * `extra` JSONB (holding `cctv_confirmed` for security and `material_action`
 * for store_manager). The permit table has no such column, so we only select
 * `extra` for the gate_pass entity and leave it undefined for permits.
 *
 * Back-compat: the excluded ApprovalProgress pair and PermitApprovalsList
 * still import `usePermitApprovals` / `useGatePassApprovals`, their `extra`
 * helpers, and the `PermitApproval` / `GatePassApproval` types. Those are all
 * re-exported here as thin wrappers over the generic implementation so their
 * behaviour is unchanged.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ApprovalEntity = 'permit' | 'gate_pass';

export type EntityApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped';
export type EntityApprovalAuthMethod = 'password' | 'webauthn';

/**
 * Merged approval-row shape. `permit_id` / `gate_pass_id` are both optional so
 * a single type covers both tables; the correct one is always present for a
 * given entity. `extra` is only populated for gate passes.
 */
export interface EntityApproval {
  id: string;
  permit_id?: string;
  gate_pass_id?: string;
  workflow_step_id: string | null;
  role_id: string | null;
  role_name: string;
  status: EntityApprovalStatus;
  approver_user_id: string | null;
  approver_name: string | null;
  approver_email: string | null;
  approved_at: string | null;
  comments: string | null;
  signature: string | null;
  signature_hash: string | null;
  auth_method: EntityApprovalAuthMethod | null;
  webauthn_credential_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ApprovalEntityConfig {
  table: string;
  fk: string;
  key: string;
  /** gate passes carry an extra JSONB column; permits do not. */
  hasExtra: boolean;
}

const APPROVAL_CFG: Record<ApprovalEntity, ApprovalEntityConfig> = {
  permit: {
    table: 'permit_approvals',
    fk: 'permit_id',
    key: 'permit-approvals',
    hasExtra: false,
  },
  gate_pass: {
    table: 'gate_pass_approvals',
    fk: 'gate_pass_id',
    key: 'gate-pass-approvals',
    hasExtra: true,
  },
} as const;

export function useEntityApprovals(entity: ApprovalEntity, id: string | undefined) {
  const cfg = APPROVAL_CFG[entity];

  return useQuery({
    queryKey: [cfg.key, id],
    enabled: !!id,
    queryFn: async (): Promise<EntityApproval[]> => {
      if (!id) return [];

      // Join workflow_steps to get the step_order so the UI can render
      // approvals in the right sequence. Not every row has a
      // workflow_step_id (legacy backfilled rows are fine without one),
      // so we select it as a nullable left-join and sort with a fallback.
      // The generated types don't know the table name is a variable, so we
      // cast through `as any` (the codebase already does this elsewhere).
      const { data, error } = await (supabase as any)
        .from(cfg.table)
        .select(`
          id, ${cfg.fk}, workflow_step_id, role_id, role_name, status,
          approver_user_id, approver_name, approver_email, approved_at,
          comments, signature, signature_hash,
          auth_method, webauthn_credential_id,
          ip_address, user_agent, device_info,${cfg.hasExtra ? ' extra,' : ''}
          created_at, updated_at,
          workflow_steps ( step_order )
        `)
        .eq(cfg.fk, id);

      if (error) throw error;

      type RowWithJoin = EntityApproval & {
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
 * Legacy permit-status column name for a given role. Useful during
 * Phase 2c rollout when a component might want to compare what the
 * new table says against the old columns for drift detection.
 */
export function legacyStatusColumnFor(roleName: string): string {
  return `${roleName}_status`;
}

/**
 * Derive the "current role" that needs to act, if any. Useful when a
 * component wants to know "who is this permit waiting on right now?"
 * without recomputing it from scratch.
 *
 * Returns null if the entity has no pending approvals (fully approved,
 * rejected, or no approvals rows yet).
 */
export function currentPendingRole(approvals: EntityApproval[]): string | null {
  const firstPending = approvals.find((a) => a.status === 'pending');
  return firstPending?.role_name ?? null;
}

/**
 * CCTV confirmation lives in `extra.cctv_confirmed` for the security role.
 * Small helper so the display component doesn't have to know the shape.
 */
export function cctvConfirmed(approval: EntityApproval | null | undefined): boolean {
  if (!approval?.extra) return false;
  return approval.extra.cctv_confirmed === true;
}

/**
 * Material action (`in` or `out`) lives in `extra.material_action` for
 * the store_manager role.
 */
export function materialAction(approval: EntityApproval | null | undefined): string | null {
  if (!approval?.extra) return null;
  const val = approval.extra.material_action;
  return typeof val === 'string' ? val : null;
}

// ---------------------------------------------------------------------------
// Back-compat aliases for the excluded ApprovalProgress pair and
// PermitApprovalsList, whose behaviour is unchanged by this refactor.
// ---------------------------------------------------------------------------

export type PermitApproval = EntityApproval;
export type GatePassApproval = EntityApproval;
export type PermitApprovalStatus = EntityApprovalStatus;
export type GatePassApprovalStatus = EntityApprovalStatus;
export type PermitApprovalAuthMethod = EntityApprovalAuthMethod;
export type GatePassApprovalAuthMethod = EntityApprovalAuthMethod;

export function usePermitApprovals(permitId: string | undefined) {
  return useEntityApprovals('permit', permitId);
}

export function useGatePassApprovals(gatePassId: string | undefined) {
  return useEntityApprovals('gate_pass', gatePassId);
}
