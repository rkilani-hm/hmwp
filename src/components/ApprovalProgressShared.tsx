/**
 * ApprovalProgressShared (audit item D2)
 *
 * Shared PRESENTATIONAL core for PermitApprovalProgress and
 * GatePassApprovalProgress. The two components legitimately differ in how they
 * COMPUTE their rows (WP loads the workflow template + requirement overrides;
 * GP receives `expectedRoles` and derives status from the pass status), so that
 * logic stays in each component. Everything they RENDER identically — the
 * progress header, the "Submitted" anchor row, the per-step ApprovalCard, and
 * the status visuals/labels — lives here so the two can't drift apart again.
 *
 * i18n keys differ only by namespace, so callers pass `keyPrefix`
 * ('permits.approvalProgress' | 'gatePasses.approvalProgress'). Gate-pass-only
 * chips (CCTV confirmed, material in/out) are injected via the `extraChips` slot.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, Circle, MinusCircle, Fingerprint, KeyRound } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { EntityApproval } from '@/hooks/useEntityApprovals';

export type RenderStatus = 'approved' | 'rejected' | 'pending' | 'upcoming';

export function statusVisual(status: RenderStatus) {
  switch (status) {
    case 'approved':
      return { icon: CheckCircle2, iconColor: 'text-success', chip: 'bg-success/10 text-success', border: 'border-success/30' };
    case 'rejected':
      return { icon: XCircle, iconColor: 'text-destructive', chip: 'bg-destructive/10 text-destructive', border: 'border-destructive/30' };
    case 'pending':
      return { icon: Clock, iconColor: 'text-warning', chip: 'bg-warning/15 text-warning', border: 'border-warning/30' };
    case 'upcoming':
      return { icon: MinusCircle, iconColor: 'text-muted-foreground', chip: 'bg-muted text-muted-foreground', border: 'border-border' };
  }
}

function statusLabelKey(status: RenderStatus, keyPrefix: string): string {
  switch (status) {
    case 'approved': return 'status.approved';
    case 'rejected': return 'status.rejected';
    case 'pending':  return 'status.pending';
    case 'upcoming': return `${keyPrefix}.upcoming`;
  }
}

/** snake_case role name -> Title Case, for roles without an explicit label. */
export function defaultRoleLabel(roleName: string): string {
  return roleName
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function formatApprovalDate(iso: string): string {
  try {
    // Western Arabic numerals even in Arabic UI, per the i18n spec.
    return format(new Date(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

export function ProgressHeader({ completed, total, keyPrefix }: { completed: number; total: number; keyPrefix: string }) {
  const { t } = useTranslation();
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span dir="auto">{t(`${keyPrefix}.stepCount`, { completed, total })}</span>
        <span className="numeric">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

export function SubmittedRow({ isSubmitted, keyPrefix }: { isSubmitted: boolean; keyPrefix: string }) {
  const { t } = useTranslation();
  const Icon = isSubmitted ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
      <Icon className={cn('h-5 w-5 shrink-0', isSubmitted ? 'text-success' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="text-sm font-medium" dir="auto">{t(`${keyPrefix}.submitted`)}</span>
    </div>
  );
}

export function ApprovalCard({
  label,
  status,
  approval,
  approvedLabel,
  keyPrefix,
  extraChips,
}: {
  label: string;
  status: RenderStatus;
  approval: EntityApproval | null;
  /** "Approved"/"Reviewed" per the acting user's actor_type (R5); approved rows only. */
  approvedLabel?: string;
  keyPrefix: string;
  /** Entity-specific chips (e.g. gate-pass CCTV confirmed / material in-out). */
  extraChips?: ReactNode;
}) {
  const { t } = useTranslation();
  const visual = statusVisual(status);
  const StatusIcon = visual.icon;
  const approvedAtFormatted = approval?.approved_at ? formatApprovalDate(approval.approved_at) : null;

  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-md border transition-colors', visual.border)}>
      <StatusIcon className={cn('h-5 w-5 shrink-0 mt-0.5', visual.iconColor)} aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" dir="auto">{label}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full', visual.chip)}>
            {status === 'approved' && approvedLabel ? approvedLabel : t(statusLabelKey(status, keyPrefix))}
          </span>
          {approval?.auth_method === 'webauthn' && (
            <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" aria-label="Biometric verified" />
          )}
          {approval?.auth_method === 'password' && (
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-label="Password verified" />
          )}
          {extraChips}
        </div>

        {approval?.approver_name && (
          <p className="text-xs text-muted-foreground" dir="auto">
            {approval.approver_name}
            {approvedAtFormatted && (
              <>
                <span className="mx-1.5">·</span>
                <time dateTime={approval.approved_at ?? undefined} className="numeric">{approvedAtFormatted}</time>
              </>
            )}
          </p>
        )}

        {status === 'pending' && !approval?.approver_name && (
          <p className="text-xs text-warning" dir="auto">{t(`${keyPrefix}.awaitingApproval`)}</p>
        )}

        {approval?.comments && (
          <p className="text-xs mt-1 whitespace-pre-wrap" dir="auto">{approval.comments}</p>
        )}
      </div>

      {approval?.signature && status === 'approved' && (
        <img src={approval.signature} alt="" className="h-8 w-16 object-contain rounded border bg-background shrink-0" />
      )}
    </div>
  );
}
