import { cn } from '@/lib/utils';
import { Check, X, Clock, Circle } from 'lucide-react';
import { PermitStatus } from '@/types/workPermit';

export interface ApprovalRecord {
  status: 'pending' | 'approved' | 'rejected';
  approverName?: string;
  date?: string;
  comments?: string;
  signature?: string;
}

export interface WorkTypeRequirements {
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor: boolean;
  requires_pmd_coordinator: boolean;
}

export interface WorkflowPermit {
  id: string;
  status: PermitStatus;
  helpdeskApproval: ApprovalRecord;
  pmApproval: ApprovalRecord;
  pdApproval: ApprovalRecord;
  bdcrApproval: ApprovalRecord;
  mprApproval: ApprovalRecord;
  itApproval: ApprovalRecord;
  fitoutApproval: ApprovalRecord;
  ecovertSupervisorApproval: ApprovalRecord;
  pmdCoordinatorApproval: ApprovalRecord;
}

interface WorkflowTimelineProps {
  permit: WorkflowPermit;
  workTypeRequirements?: WorkTypeRequirements | null;
  className?: string;
}

interface TimelineStep {
  key: string;
  label: string;
  required: boolean;
  status: 'completed' | 'rejected' | 'pending' | 'upcoming' | 'skipped';
  approver?: string | null;
  date?: string | null;
}

export function WorkflowTimeline({ permit, workTypeRequirements, className }: WorkflowTimelineProps) {
  const getStepStatus = (approval: { status: 'pending' | 'approved' | 'rejected' | null }) => {
    if (approval.status === 'approved') return 'completed';
    if (approval.status === 'rejected') return 'rejected';
    if (approval.status === 'pending') return 'pending';
    return 'upcoming';
  };

  // Determine if a step is required based on work type requirements
  const isStepRequired = (key: string): boolean => {
    // Submitted and Helpdesk are always required
    if (key === 'submitted' || key === 'helpdesk') return true;
    
    if (!workTypeRequirements) {
      // If no work type requirements, check if the approval status is not null (legacy behavior)
      const approvalMap: Record<string, ApprovalRecord | undefined> = {
        pm: permit.pmApproval,
        pd: permit.pdApproval,
        bdcr: permit.bdcrApproval,
        mpr: permit.mprApproval,
        it: permit.itApproval,
        fitout: permit.fitoutApproval,
        ecovert_supervisor: permit.ecovertSupervisorApproval,
        pmd_coordinator: permit.pmdCoordinatorApproval,
      };
      const approval = approvalMap[key];
      return approval?.status !== null && approval?.status !== undefined;
    }
    
    // Check work type requirements
    const requirementMap: Record<string, boolean> = {
      pm: workTypeRequirements.requires_pm,
      pd: workTypeRequirements.requires_pd,
      bdcr: workTypeRequirements.requires_bdcr,
      mpr: workTypeRequirements.requires_mpr,
      it: workTypeRequirements.requires_it,
      fitout: workTypeRequirements.requires_fitout,
      ecovert_supervisor: workTypeRequirements.requires_ecovert_supervisor,
      pmd_coordinator: workTypeRequirements.requires_pmd_coordinator,
    };
    
    return requirementMap[key] ?? false;
  };

  const steps: TimelineStep[] = [
    {
      key: 'submitted',
      label: 'Submitted',
      required: true,
      status: permit.status !== 'draft' ? 'completed' : 'upcoming',
    },
    {
      key: 'helpdesk',
      label: 'Helpdesk Review',
      required: true,
      status: getStepStatus(permit.helpdeskApproval),
      approver: permit.helpdeskApproval.approverName,
      date: permit.helpdeskApproval.date,
    },
    {
      key: 'pm',
      label: 'PM Approval',
      required: isStepRequired('pm'),
      status: isStepRequired('pm') ? getStepStatus(permit.pmApproval) : 'skipped',
      approver: permit.pmApproval.approverName,
      date: permit.pmApproval.date,
    },
    {
      key: 'pd',
      label: 'PD Approval',
      required: isStepRequired('pd'),
      status: isStepRequired('pd') ? getStepStatus(permit.pdApproval) : 'skipped',
      approver: permit.pdApproval.approverName,
      date: permit.pdApproval.date,
    },
    {
      key: 'bdcr',
      label: 'BDCR Approval',
      required: isStepRequired('bdcr'),
      status: isStepRequired('bdcr') ? getStepStatus(permit.bdcrApproval) : 'skipped',
      approver: permit.bdcrApproval.approverName,
      date: permit.bdcrApproval.date,
    },
    {
      key: 'mpr',
      label: 'MPR Approval',
      required: isStepRequired('mpr'),
      status: isStepRequired('mpr') ? getStepStatus(permit.mprApproval) : 'skipped',
      approver: permit.mprApproval.approverName,
      date: permit.mprApproval.date,
    },
    {
      key: 'it',
      label: 'IT Approval',
      required: isStepRequired('it'),
      status: isStepRequired('it') ? getStepStatus(permit.itApproval) : 'skipped',
      approver: permit.itApproval.approverName,
      date: permit.itApproval.date,
    },
    {
      key: 'fitout',
      label: 'Fit-Out Approval',
      required: isStepRequired('fitout'),
      status: isStepRequired('fitout') ? getStepStatus(permit.fitoutApproval) : 'skipped',
      approver: permit.fitoutApproval.approverName,
      date: permit.fitoutApproval.date,
    },
    {
      key: 'ecovert_supervisor',
      label: 'Ecovert Supervisor',
      required: isStepRequired('ecovert_supervisor'),
      status: isStepRequired('ecovert_supervisor') ? getStepStatus(permit.ecovertSupervisorApproval) : 'skipped',
      approver: permit.ecovertSupervisorApproval.approverName,
      date: permit.ecovertSupervisorApproval.date,
    },
    {
      key: 'pmd_coordinator',
      label: 'PMD Coordinator',
      required: isStepRequired('pmd_coordinator'),
      status: isStepRequired('pmd_coordinator') ? getStepStatus(permit.pmdCoordinatorApproval) : 'skipped',
      approver: permit.pmdCoordinatorApproval.approverName,
      date: permit.pmdCoordinatorApproval.date,
    },
  ];

  const visibleSteps = steps.filter(step => step.status !== 'skipped');

  return (
    <div className={cn('space-y-0', className)}>
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
            {step.approver && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {step.approver} • {step.date}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
