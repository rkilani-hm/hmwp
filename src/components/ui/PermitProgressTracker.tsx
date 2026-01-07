import { cn } from '@/lib/utils';
import { Check, X, Clock, Circle, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ApprovalStep {
  key: string;
  label: string;
  shortLabel: string;
  status: 'completed' | 'rejected' | 'pending' | 'upcoming' | 'skipped';
  approverName?: string | null;
  date?: string | null;
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
  helpdesk_status?: string | null;
  pm_status?: string | null;
  pd_status?: string | null;
  bdcr_status?: string | null;
  mpr_status?: string | null;
  it_status?: string | null;
  fitout_status?: string | null;
  ecovert_supervisor_status?: string | null;
  pmd_coordinator_status?: string | null;
  helpdesk_approver_name?: string | null;
  pm_approver_name?: string | null;
  pd_approver_name?: string | null;
  bdcr_approver_name?: string | null;
  mpr_approver_name?: string | null;
  it_approver_name?: string | null;
  fitout_approver_name?: string | null;
  ecovert_supervisor_approver_name?: string | null;
  pmd_coordinator_approver_name?: string | null;
  work_types?: WorkTypeRequirements | null;
}

interface PermitProgressTrackerProps {
  permit: PermitData;
  compact?: boolean;
  className?: string;
}

export function PermitProgressTracker({ permit, compact = false, className }: PermitProgressTrackerProps) {
  const getApprovalStatus = (status: string | null | undefined): 'completed' | 'rejected' | 'pending' | 'upcoming' => {
    if (status === 'approved') return 'completed';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending') return 'pending';
    return 'upcoming';
  };

  const workType = permit.work_types;

  // Determine if a step is required
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

  const allSteps: ApprovalStep[] = [
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

  // Filter out skipped steps
  const visibleSteps = allSteps.filter(step => step.status !== 'skipped');

  // Find current step index (first pending step)
  const currentStepIndex = visibleSteps.findIndex(step => step.status === 'pending');
  
  // Calculate progress percentage
  const completedSteps = visibleSteps.filter(step => step.status === 'completed').length;
  const progressPercentage = (completedSteps / visibleSteps.length) * 100;

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
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Progress</span>
        <span>{completedSteps} of {visibleSteps.length} steps</span>
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
