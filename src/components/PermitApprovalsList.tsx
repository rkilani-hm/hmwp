import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, MinusCircle, Fingerprint, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  usePermitApprovals,
  type PermitApproval,
  type PermitApprovalStatus,
} from '@/hooks/usePermitApprovals';

interface Props {
  permitId: string;
  /**
   * Optional lookup to translate role_name keys (e.g. "helpdesk",
   * "head_cr") into display labels. When omitted, the raw role_name
   * is used with first-letter capitalization.
   */
  roleLabel?: (roleName: string) => string;
  className?: string;
}

/**
 * PermitApprovalsList (Phase 2c-1).
 *
 * Reads from the new `permit_approvals` table via usePermitApprovals.
 * No caller uses this yet — it's the scaffold that Phase 2c-2 will
 * mount on PermitDetail in place of the legacy per-role column reads.
 *
 * Renders one row per approval with:
 *   - role name (labeled)
 *   - status chip (pending / approved / rejected / skipped)
 *   - approver name + timestamp when available
 *   - signature thumbnail when present
 *   - auth method icon (fingerprint / key) for approved rows
 *   - inline comments under the row
 */
export function PermitApprovalsList({ permitId, roleLabel, className }: Props) {
  const { t } = useTranslation();
  const { data: approvals, isLoading, error } = usePermitApprovals(permitId);

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-sm text-destructive" dir="auto">
          {t('errors.generic')}
        </CardContent>
      </Card>
    );
  }

  if (!approvals || approvals.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-sm text-muted-foreground" dir="auto">
          {t('permits.approvals.empty')}
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className={cn('space-y-3', className)} aria-label={t('permits.approvals.listLabel') ?? undefined}>
      {approvals.map((a) => (
        <ApprovalRow
          key={a.id}
          approval={a}
          roleLabel={roleLabel ? roleLabel(a.role_name) : defaultRoleLabel(a.role_name)}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

function ApprovalRow({
  approval,
  roleLabel,
}: {
  approval: PermitApproval;
  roleLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const { icon: StatusIcon, tone } = statusVisual(approval.status);

  const statusLabelKey: Record<PermitApprovalStatus, string> = {
    pending: 'status.pending',
    approved: 'status.approved',
    rejected: 'status.rejected',
    skipped: 'permits.approvals.skipped',
  };

  const approvedAtFormatted = approval.approved_at
    ? formatApprovalDate(approval.approved_at, i18n.language)
    : null;

  return (
    <li>
      <Card className={cn('transition-colors', toneBackground(tone))}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <StatusIcon className={cn('h-5 w-5 shrink-0 mt-0.5', toneIcon(tone))} aria-hidden="true" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium" dir="auto">
                  {roleLabel}
                </span>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    toneChip(tone),
                  )}
                >
                  {t(statusLabelKey[approval.status])}
                </span>
                {approval.auth_method === 'webauthn' && (
                  <Fingerprint
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-label="Biometric verified"
                  />
                )}
                {approval.auth_method === 'password' && (
                  <KeyRound
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-label="Password verified"
                  />
                )}
              </div>

              {approval.approver_name && (
                <p className="text-sm text-muted-foreground" dir="auto">
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

              {approval.comments && (
                <p className="text-sm mt-2 whitespace-pre-wrap" dir="auto">
                  {approval.comments}
                </p>
              )}
            </div>

            {approval.signature && approval.status === 'approved' && (
              <img
                src={approval.signature}
                alt=""
                className="h-10 w-20 object-contain rounded border bg-background shrink-0"
              />
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Visual helpers — keep all tone lookups in one place so future palette
// tweaks happen in one file.
// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'approved' | 'rejected' | 'pending' | 'skipped';

function statusVisual(status: PermitApprovalStatus): { icon: typeof CheckCircle2; tone: Tone } {
  switch (status) {
    case 'approved':
      return { icon: CheckCircle2, tone: 'approved' };
    case 'rejected':
      return { icon: XCircle, tone: 'rejected' };
    case 'pending':
      return { icon: Clock, tone: 'pending' };
    case 'skipped':
      return { icon: MinusCircle, tone: 'skipped' };
    default:
      return { icon: Clock, tone: 'neutral' };
  }
}

function toneIcon(tone: Tone): string {
  switch (tone) {
    case 'approved':
      return 'text-success';
    case 'rejected':
      return 'text-destructive';
    case 'pending':
      return 'text-warning';
    case 'skipped':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

function toneBackground(tone: Tone): string {
  switch (tone) {
    case 'approved':
      return 'border-success/30';
    case 'rejected':
      return 'border-destructive/30';
    case 'pending':
      return 'border-warning/30';
    default:
      return '';
  }
}

function toneChip(tone: Tone): string {
  switch (tone) {
    case 'approved':
      return 'bg-success/10 text-success';
    case 'rejected':
      return 'bg-destructive/10 text-destructive';
    case 'pending':
      return 'bg-warning/15 text-warning';
    case 'skipped':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function defaultRoleLabel(roleName: string): string {
  // "head_cr" → "Head cr"  (caller should provide proper labels; this is
  // a safety net so a missing translation doesn't render as raw snake_case).
  return roleName
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatApprovalDate(iso: string, lng: string): string {
  try {
    const d = new Date(iso);
    // Western Arabic numerals per the i18n spec — we don't switch to
    // Eastern Arabic numerals even in Arabic mode.
    return format(d, 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}
