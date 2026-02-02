import { cn } from '@/lib/utils';
import { Check, X, Clock, Circle, Timer, Loader2, Settings2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAverageApprovalTimes } from '@/hooks/useAverageApprovalTimes';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePermitWorkflowOverridesMap } from '@/hooks/usePermitWorkflowOverrides';
import type { PermitStatus } from '@/types/workPermit';

// Interfaces
interface ApprovalStep {
  key: string;
  label: string;
  shortLabel: string;
  status: 'completed' | 'rejected' | 'pending' | 'upcoming' | 'skipped';
  approverName?: string | null;
  date?: string | null;
  comments?: string | null;
}

interface WorkflowStep {
  id: string;
  step_order: number;
  step_name: string | null;
  is_required_default: boolean | null;
  can_be_skipped: boolean | null;
  role_id: string;
  roles: {
    id: string;
    name: string;
    label: string;
  } | null;
}

interface WorkTypeStepConfig {
  workflow_step_id: string;
  is_required: boolean;
}

interface WorkTypeRequirements {
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor?: boolean;
  requires_pmd_coordinator?: boolean;
}

export interface UnifiedPermitData {
  id: string;
  status: PermitStatus | string;
  work_type_id?: string | null;
  is_internal?: boolean | null;
  workflow_customized?: boolean | null;
  // All approval statuses
  customer_service_status?: string | null;
  helpdesk_status?: string | null;
  cr_coordinator_status?: string | null;
  head_cr_status?: string | null;
  pm_status?: string | null;
  pd_status?: string | null;
  bdcr_status?: string | null;
  mpr_status?: string | null;
  it_status?: string | null;
  fitout_status?: string | null;
  ecovert_supervisor_status?: string | null;
  pmd_coordinator_status?: string | null;
  fmsp_approval_status?: string | null;
  // Approver names
  customer_service_approver_name?: string | null;
  helpdesk_approver_name?: string | null;
  cr_coordinator_approver_name?: string | null;
  head_cr_approver_name?: string | null;
  pm_approver_name?: string | null;
  pd_approver_name?: string | null;
  bdcr_approver_name?: string | null;
  mpr_approver_name?: string | null;
  it_approver_name?: string | null;
  fitout_approver_name?: string | null;
  ecovert_supervisor_approver_name?: string | null;
  pmd_coordinator_approver_name?: string | null;
  fmsp_approval_approver_name?: string | null;
  // Approval dates
  customer_service_date?: string | null;
  helpdesk_date?: string | null;
  cr_coordinator_date?: string | null;
  head_cr_date?: string | null;
  pm_date?: string | null;
  pd_date?: string | null;
  bdcr_date?: string | null;
  mpr_date?: string | null;
  it_date?: string | null;
  fitout_date?: string | null;
  ecovert_supervisor_date?: string | null;
  pmd_coordinator_date?: string | null;
  fmsp_approval_date?: string | null;
  // Approval comments
  customer_service_comments?: string | null;
  helpdesk_comments?: string | null;
  cr_coordinator_comments?: string | null;
  head_cr_comments?: string | null;
  pm_comments?: string | null;
  pd_comments?: string | null;
  bdcr_comments?: string | null;
  mpr_comments?: string | null;
  it_comments?: string | null;
  fitout_comments?: string | null;
  ecovert_supervisor_comments?: string | null;
  pmd_coordinator_comments?: string | null;
  fmsp_approval_comments?: string | null;
  // Legacy work type requirements
  work_types?: WorkTypeRequirements | null;
}

interface UnifiedWorkflowProgressProps {
  permit: UnifiedPermitData;
  className?: string;
}

// Role name to permit field prefix mapping
const ROLE_TO_FIELD_PREFIX: Record<string, string> = {
  customer_service: 'customer_service',
  helpdesk: 'helpdesk',
  cr_coordinator: 'cr_coordinator',
  head_cr: 'head_cr',
  pm: 'pm',
  pd: 'pd',
  bdcr: 'bdcr',
  mpr: 'mpr',
  it: 'it',
  fitout: 'fitout',
  ecovert_supervisor: 'ecovert_supervisor',
  pmd_coordinator: 'pmd_coordinator',
  fmsp_approval: 'fmsp_approval',
};

// Generate short labels for compact view
const generateShortLabel = (roleName: string): string => {
  const labelMap: Record<string, string> = {
    customer_service: 'CS',
    helpdesk: 'HD',
    cr_coordinator: 'CRC',
    head_cr: 'HCR',
    pm: 'PM',
    pd: 'PD',
    bdcr: 'BDCR',
    mpr: 'MPR',
    it: 'IT',
    fitout: 'FIT',
    ecovert_supervisor: 'ECO',
    pmd_coordinator: 'PMD',
    fmsp_approval: 'FMSP',
  };
  return labelMap[roleName] || roleName.substring(0, 3).toUpperCase();
};

export function UnifiedWorkflowProgress({ permit, className }: UnifiedWorkflowProgressProps) {
  const { data: avgTimes } = useAverageApprovalTimes();

  // Fetch permit-specific workflow overrides
  const { data: permitOverrides, isLoading: isLoadingOverrides } = usePermitWorkflowOverridesMap(permit.id);

  // Fetch dynamic workflow data from database
  const { data: workflowData, isLoading: isLoadingWorkflowData } = useQuery({
    queryKey: ['unified-workflow-progress', permit.work_type_id],
    queryFn: async () => {
      if (!permit.work_type_id) return null;

      // Fetch work type with workflow template
      const { data: workType } = await supabase
        .from('work_types')
        .select('*, workflow_templates(*)')
        .eq('id', permit.work_type_id)
        .single();

      if (!workType?.workflow_template_id) return null;

      // Fetch workflow steps with roles
      const { data: steps } = await supabase
        .from('workflow_steps')
        .select('*, roles:role_id(id, name, label)')
        .eq('workflow_template_id', workType.workflow_template_id)
        .order('step_order', { ascending: true });

      // Fetch work type step configurations
      const { data: stepConfigs } = await supabase
        .from('work_type_step_config')
        .select('*')
        .eq('work_type_id', permit.work_type_id);

      return {
        workType,
        steps: steps as WorkflowStep[] | null,
        stepConfigs: stepConfigs as WorkTypeStepConfig[] | null,
        templateName: workType.workflow_templates?.name,
      };
    },
    enabled: !!permit.work_type_id,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = isLoadingWorkflowData || isLoadingOverrides;

  // Helper to get approval status from database value
  const getApprovalStatus = (status: string | null | undefined): 'completed' | 'rejected' | 'pending' | 'upcoming' => {
    if (status === 'approved') return 'completed';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending') return 'pending';
    return 'upcoming';
  };

  // Check if a dynamic step is required (priority: permit overrides → work type config → step defaults → legacy fallback)
  const isDynamicStepRequired = (step: WorkflowStep): boolean => {
    // 1. Permit-specific overrides (highest priority)
    if (permitOverrides?.has(step.id)) {
      return permitOverrides.get(step.id)!;
    }

    // 2. Work type step config overrides
    const config = workflowData?.stepConfigs?.find(c => c.workflow_step_id === step.id);
    if (config) {
      return config.is_required;
    }

    // 3. Step default from Workflow Builder (is_required_default)
    // This takes priority over legacy fields
    if (step.is_required_default !== null && step.is_required_default !== undefined) {
      return step.is_required_default;
    }

    // 4. Legacy work_type requires_* fields (fallback only)
    const roleName = step.roles?.name;
    if (roleName && workflowData?.workType) {
      const legacyField = `requires_${roleName}` as keyof typeof workflowData.workType;
      if (legacyField in workflowData.workType) {
        const value = workflowData.workType[legacyField];
        if (typeof value === 'boolean') {
          return value;
        }
      }
    }

    // 5. Default to required if nothing else specified
    return true;
  };

  // Build steps from dynamic workflow template
  const buildDynamicSteps = (): ApprovalStep[] => {
    if (!workflowData?.steps) return [];

    const steps: ApprovalStep[] = [
      {
        key: 'submitted',
        label: 'Submitted',
        shortLabel: 'SUB',
        status: permit.status !== 'draft' ? 'completed' : 'upcoming',
      },
    ];

    workflowData.steps.forEach(step => {
      const roleName = step.roles?.name || '';
      const fieldPrefix = ROLE_TO_FIELD_PREFIX[roleName] || roleName;

      const statusField = `${fieldPrefix}_status` as keyof UnifiedPermitData;
      const approverField = `${fieldPrefix}_approver_name` as keyof UnifiedPermitData;
      const dateField = `${fieldPrefix}_date` as keyof UnifiedPermitData;
      const commentsField = `${fieldPrefix}_comments` as keyof UnifiedPermitData;

      const isRequired = isDynamicStepRequired(step);
      const dbStatus = permit[statusField] as string | null | undefined;
      const approverName = permit[approverField] as string | null | undefined;
      const date = permit[dateField] as string | null | undefined;
      const comments = permit[commentsField] as string | null | undefined;

      // Determine step status
      let stepStatus: ApprovalStep['status'] = 'upcoming';
      if (!isRequired) {
        stepStatus = 'skipped';
      } else {
        // Check if permit is currently at this step
        if (permit.status === `pending_${roleName}`) {
          stepStatus = 'pending';
        } else if (dbStatus === 'approved') {
          stepStatus = 'completed';
        } else if (dbStatus === 'rejected') {
          stepStatus = 'rejected';
        }
      }

      steps.push({
        key: roleName || step.id,
        label: step.step_name || step.roles?.label || 'Approval',
        shortLabel: generateShortLabel(roleName),
        status: stepStatus,
        approverName,
        date,
        comments,
      });
    });

    return steps;
  };

  // Build legacy steps (fallback for permits without dynamic workflow)
  const buildLegacySteps = (): ApprovalStep[] => {
    const workType = permit.work_types;

    const isRequired = (key: string): boolean => {
      if (key === 'submitted' || key === 'helpdesk') return true;
      if (!workType) return false;

      const requirementMap: Record<string, boolean | undefined> = {
        pm: workType.requires_pm,
        pd: workType.requires_pd,
        bdcr: workType.requires_bdcr,
        mpr: workType.requires_mpr,
        it: workType.requires_it,
        fitout: workType.requires_fitout,
        ecovert_supervisor: workType.requires_ecovert_supervisor,
        pmd_coordinator: workType.requires_pmd_coordinator,
      };

      return requirementMap[key] ?? false;
    };

    return [
      {
        key: 'submitted',
        label: 'Submitted',
        shortLabel: 'SUB',
        status: permit.status !== 'draft' ? 'completed' : 'upcoming',
      },
      {
        key: 'helpdesk',
        label: 'Helpdesk Review',
        shortLabel: 'HD',
        status: getApprovalStatus(permit.helpdesk_status),
        approverName: permit.helpdesk_approver_name,
        date: permit.helpdesk_date,
        comments: permit.helpdesk_comments,
      },
      {
        key: 'pm',
        label: 'PM Approval',
        shortLabel: 'PM',
        status: isRequired('pm') ? getApprovalStatus(permit.pm_status) : 'skipped',
        approverName: permit.pm_approver_name,
        date: permit.pm_date,
        comments: permit.pm_comments,
      },
      {
        key: 'pd',
        label: 'PD Approval',
        shortLabel: 'PD',
        status: isRequired('pd') ? getApprovalStatus(permit.pd_status) : 'skipped',
        approverName: permit.pd_approver_name,
        date: permit.pd_date,
        comments: permit.pd_comments,
      },
      {
        key: 'bdcr',
        label: 'BDCR Approval',
        shortLabel: 'BDCR',
        status: isRequired('bdcr') ? getApprovalStatus(permit.bdcr_status) : 'skipped',
        approverName: permit.bdcr_approver_name,
        date: permit.bdcr_date,
        comments: permit.bdcr_comments,
      },
      {
        key: 'mpr',
        label: 'MPR Approval',
        shortLabel: 'MPR',
        status: isRequired('mpr') ? getApprovalStatus(permit.mpr_status) : 'skipped',
        approverName: permit.mpr_approver_name,
        date: permit.mpr_date,
        comments: permit.mpr_comments,
      },
      {
        key: 'it',
        label: 'IT Approval',
        shortLabel: 'IT',
        status: isRequired('it') ? getApprovalStatus(permit.it_status) : 'skipped',
        approverName: permit.it_approver_name,
        date: permit.it_date,
        comments: permit.it_comments,
      },
      {
        key: 'fitout',
        label: 'Fit-Out Approval',
        shortLabel: 'FIT',
        status: isRequired('fitout') ? getApprovalStatus(permit.fitout_status) : 'skipped',
        approverName: permit.fitout_approver_name,
        date: permit.fitout_date,
        comments: permit.fitout_comments,
      },
      {
        key: 'ecovert_supervisor',
        label: 'Ecovert Supervisor',
        shortLabel: 'ECO',
        status: isRequired('ecovert_supervisor') ? getApprovalStatus(permit.ecovert_supervisor_status) : 'skipped',
        approverName: permit.ecovert_supervisor_approver_name,
        date: permit.ecovert_supervisor_date,
        comments: permit.ecovert_supervisor_comments,
      },
      {
        key: 'pmd_coordinator',
        label: 'PMD Coordinator',
        shortLabel: 'PMD',
        status: isRequired('pmd_coordinator') ? getApprovalStatus(permit.pmd_coordinator_status) : 'skipped',
        approverName: permit.pmd_coordinator_approver_name,
        date: permit.pmd_coordinator_date,
        comments: permit.pmd_coordinator_comments,
      },
    ];
  };

  // Calculate estimated completion time
  const calculateEstimatedCompletion = (steps: ApprovalStep[]): { hours: number; display: string } | null => {
    if (!avgTimes) return null;

    const remainingSteps = steps.filter(
      step => step.status === 'pending' || step.status === 'upcoming'
    );

    if (remainingSteps.length === 0) return null;

    let totalHours = 0;
    remainingSteps.forEach(step => {
      const avgHours = avgTimes[step.key] || 8;
      totalHours += avgHours;
    });

    if (totalHours < 1) {
      return { hours: totalHours, display: `~${Math.round(totalHours * 60)} min` };
    } else if (totalHours < 24) {
      return { hours: totalHours, display: `~${Math.round(totalHours)} hrs` };
    } else {
      const days = Math.round((totalHours / 24) * 10) / 10;
      return { hours: totalHours, display: `~${days} days` };
    }
  };

  // Build steps and filter skipped ones
  const allSteps = workflowData?.steps ? buildDynamicSteps() : buildLegacySteps();
  const visibleSteps = allSteps.filter(step => step.status !== 'skipped');

  // Calculate progress
  const completedSteps = visibleSteps.filter(step => step.status === 'completed').length;
  const progressPercentage = visibleSteps.length > 0 ? (completedSteps / visibleSteps.length) * 100 : 0;
  const estimatedCompletion = calculateEstimatedCompletion(visibleSteps);

  if (isLoading && permit.work_type_id) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with workflow name and modified badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {workflowData?.templateName && (
            <p className="text-xs text-muted-foreground">
              {workflowData.templateName}
            </p>
          )}
          {permit.workflow_customized && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] py-0">
              <Settings2 className="h-2.5 w-2.5 mr-1" />
              Modified
            </Badge>
          )}
        </div>
        {estimatedCompletion && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full text-xs text-primary">
                <Timer className="w-3 h-3" />
                <span>{estimatedCompletion.display}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Estimated time to completion</p>
              <p className="text-xs text-muted-foreground">Based on average approval times</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{completedSteps} of {visibleSteps.length} steps completed</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Compact horizontal tracker */}
      <div className="flex items-center gap-1 flex-wrap">
        {visibleSteps.map((step, index) => (
          <Tooltip key={step.key}>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-all',
                    step.status === 'completed' && 'bg-success text-success-foreground',
                    step.status === 'rejected' && 'bg-destructive text-destructive-foreground',
                    step.status === 'pending' && 'bg-warning text-warning-foreground ring-2 ring-warning/30 ring-offset-1',
                    step.status === 'upcoming' && 'bg-muted text-muted-foreground'
                  )}
                >
                  {step.status === 'completed' && <Check className="w-3.5 h-3.5" />}
                  {step.status === 'rejected' && <X className="w-3.5 h-3.5" />}
                  {step.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                  {step.status === 'upcoming' && <span>{step.shortLabel}</span>}
                </div>
                {index < visibleSteps.length - 1 && (
                  <div
                    className={cn(
                      'w-3 h-0.5 mx-0.5',
                      step.status === 'completed' ? 'bg-success' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-medium">{step.label}</p>
              {step.status === 'completed' && step.approverName && (
                <p className="text-muted-foreground">By {step.approverName}</p>
              )}
              {step.status === 'pending' && (
                <p className="text-warning">Awaiting approval</p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Detailed vertical timeline */}
      <div className="pt-4 border-t space-y-0">
        {visibleSteps.map((step, index) => (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                  step.status === 'completed' && 'bg-success border-success text-success-foreground',
                  step.status === 'rejected' && 'bg-destructive border-destructive text-destructive-foreground',
                  step.status === 'pending' && 'bg-warning/10 border-warning text-warning',
                  step.status === 'upcoming' && 'bg-muted border-border text-muted-foreground'
                )}
              >
                {step.status === 'completed' && <Check className="w-4 h-4" />}
                {step.status === 'rejected' && <X className="w-4 h-4" />}
                {step.status === 'pending' && <Clock className="w-4 h-4" />}
                {step.status === 'upcoming' && <Circle className="w-4 h-4" />}
              </div>
              {index < visibleSteps.length - 1 && (
                <div
                  className={cn(
                    'w-0.5 h-12 transition-colors',
                    step.status === 'completed' ? 'bg-success' : 'bg-border'
                  )}
                />
              )}
            </div>
            <div className="pt-1 pb-4 min-w-0 flex-1">
              <p
                className={cn(
                  'font-medium text-sm',
                  step.status === 'completed' && 'text-foreground',
                  step.status === 'rejected' && 'text-destructive',
                  step.status === 'pending' && 'text-warning',
                  step.status === 'upcoming' && 'text-muted-foreground'
                )}
              >
                {step.label}
              </p>
              {step.approverName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.approverName}
                  {step.date && ` • ${new Date(step.date).toLocaleDateString()}`}
                </p>
              )}
              {step.comments && step.status === 'rejected' && (
                <p className="text-xs text-destructive mt-1">"{step.comments}"</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {visibleSteps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No workflow steps configured
        </p>
      )}
    </div>
  );
}
