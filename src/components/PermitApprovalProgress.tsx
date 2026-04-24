/**
 * PermitApprovalProgress (Phase 2c-2b)
 *
 * Workflow-aware approval progress view. This is the reader-switch
 * replacement for UnifiedWorkflowProgress — reads ACTUAL approval data
 * from the new permit_approvals table (Phase 2b dual-write) instead of
 * hardcoded per-role columns on work_permits.
 *
 * The render logic is more or less preserved from the legacy panel:
 *   - Fetch the workflow template's steps (ordered)
 *   - Apply permit-specific + work-type-specific requirement overrides
 *   - For each required step, show the actual approval row from
 *     permit_approvals if one exists; otherwise render as pending or
 *     upcoming
 *   - Header with progress bar and "N of M steps completed"
 *
 * Intentionally dropped: the "estimated time to completion" widget —
 * it was fancy but not load-bearing, and I can add it back later by
 * consuming useAverageApprovalTimes if it turns out to matter.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { usePermitApprovals, type PermitApproval } from '@/hooks/usePermitApprovals';
import { usePermitWorkflowOverridesMap } from '@/hooks/usePermitWorkflowOverrides';

interface WorkflowStep {
  id: string;
  step_order: number;
  role_id: string;
  is_required_default: boolean | null;
  roles?: { id: string; name: string; label: string | null } | null;
}

interface WorkTypeStepConfig {
  workflow_step_id: string;
  is_required: boolean;
}

type RenderStatus = 'approved' | 'rejected' | 'pending' | 'upcoming';

interface StepRow {
  stepId: string;
  stepOrder: number;
  roleName: string;
  roleLabel: string;
  status: RenderStatus;
  approval: PermitApproval | null;
}

interface Props {
  permitId: string;
  workTypeId: string | null | undefined;
  /**
   * Overall permit status, used to decide whether the 'Submitted' anchor
   * row shows as completed or upcoming.
   */
  permitStatus?: string | null;
  className?: string;
}

export function PermitApprovalProgress({
  permitId,
  workTypeId,
  permitStatus,
  className,
}: Props) {
  const { t } = useTranslation();

  const { data: approvals, isLoading: isLoadingApprovals } =
    usePermitApprovals(permitId);
  const { data: permitOverrides, isLoading: isLoadingOverrides } =
    usePermitWorkflowOverridesMap(permitId);

  // Load the workflow template's steps + work-type step configs.
  // Same query shape UnifiedWorkflowProgress used, ported to this file
  // so this component is self-contained.
  const { data: workflowData, isLoading: isLoadingWorkflow } = useQuery({
    queryKey: ['approval-progress-workflow', workTypeId],
    enabled: !!workTypeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!workTypeId) return null;

      const { data: workType } = await supabase
        .from('work_types')
        .select('*, workflow_templates(*)')
        .eq('id', workTypeId)
        .single();
      if (!workType?.workflow_template_id) return null;

      const { data: steps } = await supabase
        .from('workflow_steps')
        .select('*, roles:role_id(id, name, label)')
        .eq('workflow_template_id', workType.workflow_template_id)
        .order('step_order', { ascending: true });

      const { data: stepConfigs } = await supabase
        .from('work_type_step_config')
        .select('*')
        .eq('work_type_id', workTypeId);

      return {
        workType,
        steps: (steps ?? []) as WorkflowStep[],
        stepConfigs: (stepConfigs ?? []) as WorkTypeStepConfig[],
      };
    },
  });

  const isLoading = isLoadingApprovals || isLoadingOverrides || isLoadingWorkflow;

  // Build the merged step list — one row per required workflow step.
  const stepRows: StepRow[] = useMemo(() => {
    if (!workflowData?.steps) return [];

    // Index approvals by role_name for O(1) lookup
    const approvalByRole = new Map<string, PermitApproval>();
    (approvals ?? []).forEach((a) => approvalByRole.set(a.role_name, a));

    const rows: StepRow[] = [];
    let encounteredPending = false;

    for (const step of workflowData.steps) {
      const roleName = step.roles?.name ?? '';
      if (!roleName) continue;

      // Is this step required for this permit? Priority:
      //   1. Permit-specific override
      //   2. Work-type step config
      //   3. Step default (is_required_default)
      //   4. requires_<role> column on work_types (legacy fallback)
      //   5. default true
      let isRequired: boolean;
      if (permitOverrides?.has(step.id)) {
        isRequired = !!permitOverrides.get(step.id);
      } else {
        const cfg = workflowData.stepConfigs.find(
          (c) => c.workflow_step_id === step.id,
        );
        if (cfg) {
          isRequired = cfg.is_required;
        } else if (step.is_required_default !== null && step.is_required_default !== undefined) {
          isRequired = step.is_required_default;
        } else {
          const legacyField = `requires_${roleName}`;
          const wt = workflowData.workType as Record<string, unknown> | null;
          const legacyVal = wt ? wt[legacyField] : undefined;
          isRequired = typeof legacyVal === 'boolean' ? legacyVal : true;
        }
      }

      if (!isRequired) continue;

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

      rows.push({
        stepId: step.id,
        stepOrder: step.step_order,
        roleName,
        roleLabel: step.roles?.label ?? defaultRoleLabel(roleName),
        status,
        approval,
      });
    }
    return rows;
  }, [workflowData, approvals, permitOverrides]);

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

  // Permit has no workflow template — fall back to the raw approval list
  // (approvals that happened, regardless of expected steps). This is the
  // rare edge case for legacy permits without a template.
  if (stepRows.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        {(approvals ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground" dir="auto">
            {t('permits.approvals.empty')}
          </p>
        ) : (
          (approvals ?? []).map((a) => (
            <ApprovalCard
              key={a.id}
              label={defaultRoleLabel(a.role_name)}
              status={(a.status === 'skipped' ? 'upcoming' : a.status) as RenderStatus}
              approval={a}
            />
          ))
        )}
      </div>
    );
  }

  const completed = stepRows.filter((r) => r.status === 'approved').length;
  const total = stepRows.length;
  const progressPct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const isSubmitted = permitStatus && permitStatus !== 'draft';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header: count + progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span dir="auto">
            {t('permits.approvalProgress.stepCount', { completed, total })}
          </span>
          <span className="numeric">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* "Submitted" anchor row — the implicit step that precedes workflow */}
      <div className="space-y-2">
        <SubmittedRow isSubmitted={!!isSubmitted} />
        {stepRows.map((row) => (
          <ApprovalCard
            key={row.stepId}
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
// Subcomponents
// ---------------------------------------------------------------------------

function SubmittedRow({ isSubmitted }: { isSubmitted: boolean }) {
  const { t } = useTranslation();
  const Icon = isSubmitted ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
      <Icon
        className={cn(
          'h-5 w-5 shrink-0',
          isSubmitted ? 'text-success' : 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
      <span className="text-sm font-medium" dir="auto">
        {t('permits.approvalProgress.submitted')}
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
  approval: PermitApproval | null;
}) {
  const { t, i18n } = useTranslation();
  const visual = statusVisual(status);
  const StatusIcon = visual.icon;

  const approvedAtFormatted = approval?.approved_at
    ? formatApprovalDate(approval.approved_at, i18n.language)
    : null;

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
        </div>

        {approval?.approver_name && (
          <p className="text-xs text-muted-foreground" dir="auto">
            {approval.approver_name}
            {approvedAtFormatted && (
              <>
                <span className="mx-1.5">·</span>
                <time
                  dateTime={approval.approved_at ?? undefined}
                  className="numeric"
                >
                  {approvedAtFormatted}
                </time>
              </>
            )}
          </p>
        )}

        {status === 'pending' && !approval?.approver_name && (
          <p className="text-xs text-warning" dir="auto">
            {t('permits.approvalProgress.awaitingApproval')}
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
// Visual + label helpers
// ---------------------------------------------------------------------------

function statusLabelKey(status: RenderStatus): string {
  switch (status) {
    case 'approved':
      return 'status.approved';
    case 'rejected':
      return 'status.rejected';
    case 'pending':
      return 'status.pending';
    case 'upcoming':
      return 'permits.approvalProgress.upcoming';
  }
}

function statusVisual(status: RenderStatus) {
  switch (status) {
    case 'approved':
      return {
        icon: CheckCircle2,
        iconColor: 'text-success',
        chip: 'bg-success/10 text-success',
        border: 'border-success/30',
      };
    case 'rejected':
      return {
        icon: XCircle,
        iconColor: 'text-destructive',
        chip: 'bg-destructive/10 text-destructive',
        border: 'border-destructive/30',
      };
    case 'pending':
      return {
        icon: Clock,
        iconColor: 'text-warning',
        chip: 'bg-warning/15 text-warning',
        border: 'border-warning/30',
      };
    case 'upcoming':
      return {
        icon: MinusCircle,
        iconColor: 'text-muted-foreground',
        chip: 'bg-muted text-muted-foreground',
        border: 'border-border',
      };
  }
}

function defaultRoleLabel(roleName: string): string {
  return roleName
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatApprovalDate(iso: string, _lng: string): string {
  try {
    const d = new Date(iso);
    // Western Arabic numerals even in Arabic UI, per the i18n spec
    return format(d, 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}
