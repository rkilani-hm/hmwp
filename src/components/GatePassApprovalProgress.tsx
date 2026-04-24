/**
 * GatePassApprovalProgress (Phase 2c-4)
 *
 * Mirrors PermitApprovalProgress (Phase 2c-2b) for gate passes:
 * reads the gate_pass_approvals table populated by Phase 2b dual-write
 * and renders each expected role with the actual approval row when one
 * exists, or a pending/upcoming placeholder otherwise.
 *
 * Gate passes don't have the same workflow-template + requirement-override
 * machinery permits have — the role list is computed by the caller from
 * the pass's workflow (if any) or from a static default that branches
 * on has_high_value_asset. So this component receives `expectedRoles`
 * as a prop rather than loading it itself. Simpler, and avoids a second
 * fetch that would duplicate logic already in GatePassDetail.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Circle,
  MinusCircle,
  Fingerprint,
  KeyRound,
  Camera,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  useGatePassApprovals,
  cctvConfirmed,
  materialAction,
  type GatePassApproval,
} from '@/hooks/useGatePassApprovals';

type RenderStatus = 'approved' | 'rejected' | 'pending' | 'upcoming';

interface Row {
  roleName: string;
  roleLabel: string;
  status: RenderStatus;
  approval: GatePassApproval | null;
}

interface Props {
  gatePassId: string;
  /**
   * Ordered list of roles expected to approve this pass. Caller derives
   * this from the gate pass's workflow (if present) or from defaults
   * (e.g. store_manager, [finance if high_value_asset], security).
   */
  expectedRoles: string[];
  /**
   * The overall gate-pass status used to decide whether the 'Submitted'
   * anchor row shows as completed or upcoming. Passes that are 'draft'
   * render the Submitted row as upcoming.
   */
  gatePassStatus?: string | null;
  className?: string;
}

export function GatePassApprovalProgress({
  gatePassId,
  expectedRoles,
  gatePassStatus,
  className,
}: Props) {
  const { t } = useTranslation();
  const { data: approvals, isLoading } = useGatePassApprovals(gatePassId);

  const rows: Row[] = useMemo(() => {
    const approvalByRole = new Map<string, GatePassApproval>();
    (approvals ?? []).forEach((a) => approvalByRole.set(a.role_name, a));

    let encounteredPending = false;
    return expectedRoles.map((roleName): Row => {
      const approval = approvalByRole.get(roleName) ?? null;
      let status: RenderStatus;
      if (approval?.status === 'approved') {
        status = 'approved';
      } else if (approval?.status === 'rejected') {
        status = 'rejected';
      } else if (approval?.status === 'pending' || (!approval && !encounteredPending)) {
        status = 'pending';
        encounteredPending = true;
      } else {
        status = 'upcoming';
      }
      return {
        roleName,
        roleLabel: defaultRoleLabel(roleName),
        status,
        approval,
      };
    });
  }, [approvals, expectedRoles]);

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-2 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const completed = rows.filter((r) => r.status === 'approved').length;
  const total = rows.length;
  const progressPct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const isSubmitted = gatePassStatus && gatePassStatus !== 'draft';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span dir="auto">
            {t('gatePasses.approvalProgress.stepCount', { completed, total })}
          </span>
          <span className="numeric">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      <div className="space-y-2">
        <SubmittedRow isSubmitted={!!isSubmitted} />
        {rows.map((row) => (
          <ApprovalCard
            key={row.roleName}
            label={row.roleLabel}
            status={row.status}
            approval={row.approval}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SubmittedRow({ isSubmitted }: { isSubmitted: boolean }) {
  const { t } = useTranslation();
  const Icon = isSubmitted ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
      <Icon
        className={cn('h-5 w-5 shrink-0', isSubmitted ? 'text-success' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="text-sm font-medium" dir="auto">
        {t('gatePasses.approvalProgress.submitted')}
      </span>
    </div>
  );
}

function ApprovalCard({
  label,
  status,
  approval,
}: {
  label: string;
  status: RenderStatus;
  approval: GatePassApproval | null;
}) {
  const { t, i18n } = useTranslation();
  const visual = statusVisual(status);
  const StatusIcon = visual.icon;

  const approvedAtFormatted = approval?.approved_at
    ? formatApprovalDate(approval.approved_at, i18n.language)
    : null;

  const isCctvVerified = approval?.role_name === 'security' && cctvConfirmed(approval);
  const ma = approval?.role_name === 'store_manager' ? materialAction(approval) : null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-md border transition-colors',
        visual.border,
      )}
    >
      <StatusIcon
        className={cn('h-5 w-5 shrink-0 mt-0.5', visual.iconColor)}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" dir="auto">
            {label}
          </span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full', visual.chip)}>
            {t(statusLabelKey(status))}
          </span>
          {approval?.auth_method === 'webauthn' && (
            <Fingerprint
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Biometric verified"
            />
          )}
          {approval?.auth_method === 'password' && (
            <KeyRound
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Password verified"
            />
          )}
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
        </div>

        {approval?.approver_name && (
          <p className="text-xs text-muted-foreground" dir="auto">
            {approval.approver_name}
            {approvedAtFormatted && (
              <>
                <span className="mx-1.5">·</span>
                <time dateTime={approval.approved_at ?? undefined} className="numeric">
                  {approvedAtFormatted}
                </time>
              </>
            )}
          </p>
        )}

        {status === 'pending' && !approval?.approver_name && (
          <p className="text-xs text-warning" dir="auto">
            {t('gatePasses.approvalProgress.awaitingApproval')}
          </p>
        )}

        {approval?.comments && (
          <p className="text-xs mt-1 whitespace-pre-wrap" dir="auto">
            {approval.comments}
          </p>
        )}
      </div>

      {approval?.signature && status === 'approved' && (
        <img
          src={approval.signature}
          alt=""
          className="h-8 w-16 object-contain rounded border bg-background shrink-0"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function statusLabelKey(status: RenderStatus): string {
  switch (status) {
    case 'approved': return 'status.approved';
    case 'rejected': return 'status.rejected';
    case 'pending':  return 'status.pending';
    case 'upcoming': return 'gatePasses.approvalProgress.upcoming';
  }
}

function statusVisual(status: RenderStatus) {
  switch (status) {
    case 'approved':
      return { icon: CheckCircle2, iconColor: 'text-success',         chip: 'bg-success/10 text-success',          border: 'border-success/30' };
    case 'rejected':
      return { icon: XCircle,      iconColor: 'text-destructive',     chip: 'bg-destructive/10 text-destructive',  border: 'border-destructive/30' };
    case 'pending':
      return { icon: Clock,        iconColor: 'text-warning',         chip: 'bg-warning/15 text-warning',          border: 'border-warning/30' };
    case 'upcoming':
      return { icon: MinusCircle,  iconColor: 'text-muted-foreground', chip: 'bg-muted text-muted-foreground',     border: 'border-border' };
  }
}

function defaultRoleLabel(roleName: string): string {
  // Map common gate-pass role keys to nicer labels. Falls back to
  // snake-case -> Title Case for anything not listed (e.g. future roles).
  const overrides: Record<string, string> = {
    store_manager:    'Store Manager',
    finance:          'Finance',
    security:         'Security',
    security_pmd:     'Security (PMD)',
    cr_coordinator:   'CR Coordinator',
    head_cr:          'Head CR',
    hm_security_pmd:  'HM Security (PMD)',
  };
  if (overrides[roleName]) return overrides[roleName];
  return roleName
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatApprovalDate(iso: string, _lng: string): string {
  try {
    return format(new Date(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}
