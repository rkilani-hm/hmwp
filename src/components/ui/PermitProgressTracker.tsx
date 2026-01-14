import { cn } from '@/lib/utils';
import { Check, X, Clock, Circle, Timer, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAverageApprovalTimes } from '@/hooks/useAverageApprovalTimes';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ApprovalStep {
  key: string;
  label: string;
  shortLabel: string;
  status: 'completed' | 'rejected' | 'pending' | 'upcoming' | 'skipped';
  approverName?: string | null;
  date?: string | null;
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

interface PermitData {
  status: string;
  work_type_id?: string | null;
  is_internal?: boolean | null;
  // Approval statuses
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
  // Legacy work type requirements
  work_types?: WorkTypeRequirements | null;
}

interface PermitProgressTrackerProps {
  permit: PermitData;
  compact?: boolean;
  className?: string;
}

// Map role names to permit field prefixes
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

// Generate short labels from role names
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

export function PermitProgressTracker({ permit, compact = false, className }: PermitProgressTrackerProps) {
  const { data: avgTimes } = useAverageApprovalTimes();

  // Fetch dynamic workflow data
  const { data: workflowData, isLoading: isLoadingWorkflow } = useQuery({
    queryKey: ['permit-progress-workflow', permit.work_type_id],
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
        .select('*, roles(*)')
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

  const getApprovalStatus = (status: string | null | undefined): 'completed' | 'rejected' | 'pending' | 'upcoming' => {
    if (status === 'approved') return 'completed';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending') return 'pending';
    return 'upcoming';
  };

  // Check if a dynamic step is required
  const isDynamicStepRequired = (step: WorkflowStep): boolean => {
    // Check work_type_step_config overrides first
    const config = workflowData?.stepConfigs?.find(c => c.workflow_step_id === step.id);
    if (config) {
      return config.is_required;
    }

    // Check legacy work_type requires_* fields
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

    // Fall back to step default
    return step.is_required_default ?? true;
  };

  // Build steps from dynamic workflow
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
      
      const statusField = `${fieldPrefix}_status` as keyof PermitData;
      const approverField = `${fieldPrefix}_approver_name` as keyof PermitData;
      const dateField = `${fieldPrefix}_date` as keyof PermitData;

      const isRequired = isDynamicStepRequired(step);
      const dbStatus = permit[statusField] as string | null | undefined;
      const approverName = permit[approverField] as string | null | undefined;
      const date = permit[dateField] as string | null | undefined;

      // Determine step status based on permit status and approval record
      let stepStatus: ApprovalStep['status'] = 'upcoming';
      if (!isRequired) {
        stepStatus = 'skipped';
      } else {
        // First check if current permit status matches this step's pending status
        if (permit.status === `pending_${roleName}`) {
          stepStatus = 'pending';
        } else if (dbStatus === 'approved') {
          stepStatus = 'completed';
        } else if (dbStatus === 'rejected') {
          stepStatus = 'rejected';
        }
        // If no explicit status, remains 'upcoming'
      }

      steps.push({
        key: roleName || step.id,
        label: step.step_name || step.roles?.label || 'Approval',
        shortLabel: generateShortLabel(roleName),
        status: stepStatus,
        approverName,
        date,
      });
    });

    return steps;
  };

  // Build legacy steps (fallback)
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
      },
      {
        key: 'pm',
        label: 'PM Approval',
        shortLabel: 'PM',
        status: isRequired('pm') ? getApprovalStatus(permit.pm_status) : 'skipped',
        approverName: permit.pm_approver_name,
      },
      {
        key: 'pd',
        label: 'PD Approval',
        shortLabel: 'PD',
        status: isRequired('pd') ? getApprovalStatus(permit.pd_status) : 'skipped',
        approverName: permit.pd_approver_name,
      },
      {
        key: 'bdcr',
        label: 'BDCR Approval',
        shortLabel: 'BDCR',
        status: isRequired('bdcr') ? getApprovalStatus(permit.bdcr_status) : 'skipped',
        approverName: permit.bdcr_approver_name,
      },
      {
        key: 'mpr',
        label: 'MPR Approval',
        shortLabel: 'MPR',
        status: isRequired('mpr') ? getApprovalStatus(permit.mpr_status) : 'skipped',
        approverName: permit.mpr_approver_name,
      },
      {
        key: 'it',
        label: 'IT Approval',
        shortLabel: 'IT',
        status: isRequired('it') ? getApprovalStatus(permit.it_status) : 'skipped',
        approverName: permit.it_approver_name,
      },
      {
        key: 'fitout',
        label: 'Fit-Out Approval',
        shortLabel: 'FIT',
        status: isRequired('fitout') ? getApprovalStatus(permit.fitout_status) : 'skipped',
        approverName: permit.fitout_approver_name,
      },
      {
        key: 'ecovert_supervisor',
        label: 'Ecovert Supervisor',
        shortLabel: 'ECO',
        status: isRequired('ecovert_supervisor') ? getApprovalStatus(permit.ecovert_supervisor_status) : 'skipped',
        approverName: permit.ecovert_supervisor_approver_name,
      },
      {
        key: 'pmd_coordinator',
        label: 'PMD Coordinator',
        shortLabel: 'PMD',
        status: isRequired('pmd_coordinator') ? getApprovalStatus(permit.pmd_coordinator_status) : 'skipped',
        approverName: permit.pmd_coordinator_approver_name,
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
      const days = Math.round(totalHours / 24 * 10) / 10;
      return { hours: totalHours, display: `~${days} days` };
    }
  };

  // Use dynamic steps if available, otherwise fall back to legacy
  const allSteps = workflowData?.steps ? buildDynamicSteps() : buildLegacySteps();
  
  // Filter out skipped steps
  const visibleSteps = allSteps.filter(step => step.status !== 'skipped');

  // Find current step index (first pending step)
  const currentStepIndex = visibleSteps.findIndex(step => step.status === 'pending');
  
  // Calculate progress percentage
  const completedSteps = visibleSteps.filter(step => step.status === 'completed').length;
  const progressPercentage = (completedSteps / visibleSteps.length) * 100;
  
  // Calculate estimated completion
  const estimatedCompletion = calculateEstimatedCompletion(visibleSteps);

  // Show loading state
  if (isLoadingWorkflow && permit.work_type_id) {
    return (
      <div className={cn('flex items-center justify-center py-4', className)}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {visibleSteps.map((step, index) => (
          <Tooltip key={step.key}>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all',
                    step.status === 'completed' && 'bg-success text-success-foreground',
                    step.status === 'rejected' && 'bg-destructive text-destructive-foreground',
                    step.status === 'pending' && 'bg-warning text-warning-foreground ring-2 ring-warning/30 ring-offset-1',
                    step.status === 'upcoming' && 'bg-muted text-muted-foreground'
                  )}
                >
                  {step.status === 'completed' && <Check className="w-3 h-3" />}
                  {step.status === 'rejected' && <X className="w-3 h-3" />}
                  {step.status === 'pending' && <Clock className="w-3 h-3" />}
                  {step.status === 'upcoming' && <span>{index + 1}</span>}
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
        {estimatedCompletion && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-primary/10 rounded-full text-xs text-primary">
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
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Progress</span>
        <div className="flex items-center gap-3">
          {estimatedCompletion && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-primary">
                  <Timer className="w-3 h-3" />
                  <span>ETA: {estimatedCompletion.display}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">Estimated time to completion</p>
                <p className="text-xs text-muted-foreground">Based on average approval times for each stage</p>
              </TooltipContent>
            </Tooltip>
          )}
          <span>{completedSteps} of {visibleSteps.length} steps</span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out rounded-full',
            visibleSteps.some(s => s.status === 'rejected') ? 'bg-destructive' : 'bg-success'
          )}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Timeline steps */}
      <div className="flex items-center justify-between mt-4">
        {visibleSteps.map((step, index) => (
          <Tooltip key={step.key}>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center flex-1 relative">
                {/* Connector line */}
                {index > 0 && (
                  <div
                    className={cn(
                      'absolute top-4 right-1/2 w-full h-0.5 -z-10',
                      visibleSteps[index - 1].status === 'completed' ? 'bg-success' : 'bg-muted'
                    )}
                  />
                )}
                
                {/* Step indicator */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all z-10 bg-background',
                    step.status === 'completed' && 'bg-success border-success text-success-foreground',
                    step.status === 'rejected' && 'bg-destructive border-destructive text-destructive-foreground',
                    step.status === 'pending' && 'border-warning text-warning bg-warning/10 shadow-md shadow-warning/20',
                    step.status === 'upcoming' && 'border-muted text-muted-foreground'
                  )}
                >
                  {step.status === 'completed' && <Check className="w-4 h-4" />}
                  {step.status === 'rejected' && <X className="w-4 h-4" />}
                  {step.status === 'pending' && <Clock className="w-4 h-4" />}
                  {step.status === 'upcoming' && <Circle className="w-3 h-3" />}
                </div>
                
                {/* Label */}
                <span
                  className={cn(
                    'text-[10px] font-medium mt-1.5 text-center',
                    step.status === 'completed' && 'text-success',
                    step.status === 'rejected' && 'text-destructive',
                    step.status === 'pending' && 'text-warning',
                    step.status === 'upcoming' && 'text-muted-foreground'
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">{step.label}</p>
              {step.status === 'completed' && step.approverName && (
                <p className="text-xs text-muted-foreground">Approved by {step.approverName}</p>
              )}
              {step.status === 'rejected' && step.approverName && (
                <p className="text-xs text-destructive">Rejected by {step.approverName}</p>
              )}
              {step.status === 'pending' && (
                <p className="text-xs text-warning">Awaiting approval</p>
              )}
              {step.status === 'upcoming' && (
                <p className="text-xs text-muted-foreground">Pending previous steps</p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Current step label */}
      {currentStepIndex >= 0 && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          Currently at: <span className="font-medium text-warning">{visibleSteps[currentStepIndex].label}</span>
        </p>
      )}
    </div>
  );
}
