/**
 * PermitApprovalProgress (Phase 2c-2b)
 *
 * Workflow-aware approval progress view. Reads ACTUAL approval data from
 * permit_approvals and merges it with the permit's workflow template + its
 * requirement overrides to render one row per required step. The shared
 * presentation (header, submitted row, per-step card, status visuals) lives in
 * ApprovalProgressShared (audit D2); only the WP-specific row computation is
 * here.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { usePermitApprovals, type PermitApproval } from '@/hooks/useEntityApprovals';
import { usePermitWorkflowOverridesMap } from '@/hooks/usePermitWorkflowOverrides';
import { useActorTypes } from '@/hooks/useActorTypes';
import { approveVerb } from '@/utils/actorVerb';
import {
  type RenderStatus,
  defaultRoleLabel,
  ProgressHeader,
  SubmittedRow,
  ApprovalCard,
} from '@/components/ApprovalProgressShared';

const KEY = 'permits.approvalProgress';

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
  /** Overall permit status, used to decide whether the 'Submitted' anchor row shows completed. */
  permitStatus?: string | null;
  className?: string;
}

export function PermitApprovalProgress({ permitId, workTypeId, permitStatus, className }: Props) {
  const { t } = useTranslation();

  const { data: approvals, isLoading: isLoadingApprovals } = usePermitApprovals(permitId);
  const { data: permitOverrides, isLoading: isLoadingOverrides } = usePermitWorkflowOverridesMap(permitId);

  // Resolve actor_type per approving user so each completed row shows
  // "Approved" vs "Reviewed" based on who actually acted (R5/E4).
  const { data: actorTypes } = useActorTypes((approvals ?? []).map((a) => a.approver_user_id));

  // Load the workflow template's steps + work-type step configs.
  const { data: workflowData, isLoading: isLoadingWorkflow } = useQuery({
    queryKey: ['approval-progress-workflow', workTypeId],
    enabled: !!workTypeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!workTypeId) return null;
      const { data: workType } = await supabase
        .from('work_types').select('*, workflow_templates(*)').eq('id', workTypeId).single();
      if (!workType?.workflow_template_id) return null;
      const { data: steps } = await supabase
        .from('workflow_steps').select('*, roles:role_id(id, name, label)')
        .eq('workflow_template_id', workType.workflow_template_id).order('step_order', { ascending: true });
      const { data: stepConfigs } = await supabase
        .from('work_type_step_config').select('*').eq('work_type_id', workTypeId);
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
    const approvalByRole = new Map<string, PermitApproval>();
    (approvals ?? []).forEach((a) => approvalByRole.set(a.role_name, a));

    const rows: StepRow[] = [];
    let encounteredPending = false;

    for (const step of workflowData.steps) {
      const roleName = step.roles?.name ?? '';
      if (!roleName) continue;

      // Required? Priority: permit override -> work-type config -> step default
      // -> legacy requires_<role> column -> default true.
      let isRequired: boolean;
      if (permitOverrides?.has(step.id)) {
        isRequired = !!permitOverrides.get(step.id);
      } else {
        const cfg = workflowData.stepConfigs.find((c) => c.workflow_step_id === step.id);
        if (cfg) {
          isRequired = cfg.is_required;
        } else if (step.is_required_default !== null && step.is_required_default !== undefined) {
          isRequired = step.is_required_default;
        } else {
          const wt = workflowData.workType as Record<string, unknown> | null;
          const legacyVal = wt ? wt[`requires_${roleName}`] : undefined;
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
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
      </div>
    );
  }

  // No workflow template — fall back to the raw approval list (legacy permits).
  if (stepRows.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        {(approvals ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground" dir="auto">{t('permits.approvals.empty')}</p>
        ) : (
          (approvals ?? []).map((a) => (
            <ApprovalCard
              key={a.id}
              keyPrefix={KEY}
              label={defaultRoleLabel(a.role_name)}
              status={(a.status === 'skipped' ? 'upcoming' : a.status) as RenderStatus}
              approval={a}
              approvedLabel={approveVerb(actorTypes?.get(a.approver_user_id ?? ''), 'past')}
            />
          ))
        )}
      </div>
    );
  }

  const completed = stepRows.filter((r) => r.status === 'approved').length;
  const isSubmitted = permitStatus && permitStatus !== 'draft';

  return (
    <div className={cn('space-y-4', className)}>
      <ProgressHeader completed={completed} total={stepRows.length} keyPrefix={KEY} />
      <div className="space-y-2">
        <SubmittedRow isSubmitted={!!isSubmitted} keyPrefix={KEY} />
        {stepRows.map((row) => (
          <ApprovalCard
            key={row.stepId}
            keyPrefix={KEY}
            label={row.roleLabel}
            status={row.status}
            approval={row.approval}
            approvedLabel={approveVerb(actorTypes?.get(row.approval?.approver_user_id ?? ''), 'past')}
          />
        ))}
      </div>
    </div>
  );
}
