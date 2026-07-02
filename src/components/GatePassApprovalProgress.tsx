/**
 * GatePassApprovalProgress (Phase 2c-4)
 *
 * Gate-pass approval progress. Receives `expectedRoles` from the caller (gate
 * passes have no workflow-template machinery) and derives each role's status
 * from the actual gate_pass_approvals rows, falling back to the pass status
 * (pending_<role>) when the mirror lags. Shared presentation (header, submitted
 * row, per-step card, status visuals) lives in ApprovalProgressShared (D2);
 * only the GP-specific row computation, role-label overrides, and the
 * CCTV/material chips are here.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useGatePassApprovals, cctvConfirmed, materialAction, type GatePassApproval } from '@/hooks/useEntityApprovals';
import { useActorTypes } from '@/hooks/useActorTypes';
import { approveVerb } from '@/utils/actorVerb';
import {
  type RenderStatus,
  ProgressHeader,
  SubmittedRow,
  ApprovalCard,
} from '@/components/ApprovalProgressShared';

const KEY = 'gatePasses.approvalProgress';

interface Row {
  roleName: string;
  roleLabel: string;
  status: RenderStatus;
  approval: GatePassApproval | null;
}

interface Props {
  gatePassId: string;
  /** Ordered roles expected to approve this pass (from the workflow or defaults). */
  expectedRoles: string[];
  /** Overall gate-pass status; decides the 'Submitted' anchor row + step fallback. */
  gatePassStatus?: string | null;
  className?: string;
}

export function GatePassApprovalProgress({ gatePassId, expectedRoles, gatePassStatus, className }: Props) {
  const { data: approvals, isLoading } = useGatePassApprovals(gatePassId);

  // Resolve actor_type per approving user so each completed row shows
  // "Approved" vs "Reviewed" from who actually acted (R5/E4).
  const { data: actorTypes } = useActorTypes((approvals ?? []).map((a) => a.approver_user_id));

  const rows: Row[] = useMemo(() => {
    const approvalByRole = new Map<string, GatePassApproval>();
    (approvals ?? []).forEach((a) => approvalByRole.set(a.role_name, a));

    // Current pending role from the pass status; when a role has no mirror row
    // yet, place it relative to that step instead of flagging the first pending.
    const s = gatePassStatus ?? '';
    const currentRole = s.startsWith('pending_') ? s.replace('pending_', '') : null;
    const isFinalApproved = s === 'approved' || s === 'completed';
    const currentIdx = currentRole ? expectedRoles.indexOf(currentRole) : -1;

    let encounteredPending = false;
    return expectedRoles.map((roleName, idx): Row => {
      const approval = approvalByRole.get(roleName) ?? null;
      let status: RenderStatus;
      if (approval?.status === 'approved') {
        status = 'approved';
      } else if (approval?.status === 'rejected') {
        status = 'rejected';
      } else if (approval?.status === 'pending') {
        status = 'pending';
        encounteredPending = true;
      } else if (currentIdx >= 0) {
        if (idx < currentIdx) status = 'approved';
        else if (idx === currentIdx) { status = 'pending'; encounteredPending = true; }
        else status = 'upcoming';
      } else if (isFinalApproved) {
        status = 'approved';
      } else if (!approval && !encounteredPending) {
        status = 'pending';
        encounteredPending = true;
      } else {
        status = 'upcoming';
      }
      return { roleName, roleLabel: defaultRoleLabel(roleName), status, approval };
    });
  }, [approvals, expectedRoles, gatePassStatus]);

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-2 w-full" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
      </div>
    );
  }

  const completed = rows.filter((r) => r.status === 'approved').length;
  const isSubmitted = gatePassStatus && gatePassStatus !== 'draft';

  return (
    <div className={cn('space-y-4', className)}>
      <ProgressHeader completed={completed} total={rows.length} keyPrefix={KEY} />
      <div className="space-y-2">
        <SubmittedRow isSubmitted={!!isSubmitted} keyPrefix={KEY} />
        {rows.map((row) => (
          <ApprovalCard
            key={row.roleName}
            keyPrefix={KEY}
            label={row.roleLabel}
            status={row.status}
            approval={row.approval}
            approvedLabel={approveVerb(actorTypes?.get(row.approval?.approver_user_id ?? ''), 'past')}
            extraChips={<GpExtraChips approval={row.approval} />}
          />
        ))}
      </div>
    </div>
  );
}

/** Gate-pass-only chips: CCTV confirmed (security) and material in/out (store manager). */
function GpExtraChips({ approval }: { approval: GatePassApproval | null }) {
  const { t } = useTranslation();
  const isCctvVerified = approval?.role_name === 'security' && cctvConfirmed(approval);
  const ma = approval?.role_name === 'store_manager' ? materialAction(approval) : null;
  if (!isCctvVerified && !ma) return null;
  return (
    <>
      {isCctvVerified && (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <Camera className="h-3 w-3" />
          {t('gatePasses.cctvConfirmed')}
        </span>
      )}
      {ma && (
        <span className="inline-flex items-center text-xs text-muted-foreground">
          ({ma === 'in' ? t('gatePasses.materialIn') : t('gatePasses.materialOut')})
        </span>
      )}
    </>
  );
}

/** GP role-label overrides (nicer than the shared humanizer for known keys). */
function defaultRoleLabel(roleName: string): string {
  const overrides: Record<string, string> = {
    store_manager: 'Store Manager',
    finance: 'Finance',
    security: 'Security',
    security_pmd: 'Security (PMD)',
    cr_coordinator: 'CR Coordinator',
    head_cr: 'Head CR',
    hm_security_pmd: 'HM Security (PMD)',
  };
  if (overrides[roleName]) return overrides[roleName];
  return roleName
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
