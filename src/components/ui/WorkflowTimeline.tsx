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
  requires_soft_facilities: boolean;
  requires_hard_facilities: boolean;
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
  softFacilitiesApproval: ApprovalRecord;
  hardFacilitiesApproval: ApprovalRecord;
  pmServiceApproval: ApprovalRecord;
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
    // Submitted, Helpdesk, and PM Service are always required
    if (key === 'submitted' || key === 'helpdesk' || key === 'pm_service') return true;
    
    if (!workTypeRequirements) {
      // If no work type requirements, check if the approval status is not null (legacy behavior)
      const approvalMap: Record<string, ApprovalRecord | undefined> = {
        pm: permit.pmApproval,
        pd: permit.pdApproval,
        bdcr: permit.bdcrApproval,
        mpr: permit.mprApproval,
        it: permit.itApproval,
        fitout: permit.fitoutApproval,
        soft_facilities: permit.softFacilitiesApproval,
        hard_facilities: permit.hardFacilitiesApproval,
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
      soft_facilities: workTypeRequirements.requires_soft_facilities,
      hard_facilities: workTypeRequirements.requires_hard_facilities,
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
      key: 'soft_facilities',
      label: 'Soft Facilities',
      required: isStepRequired('soft_facilities'),
      status: isStepRequired('soft_facilities') ? getStepStatus(permit.softFacilitiesApproval) : 'skipped',
      approver: permit.softFacilitiesApproval.approverName,
      date: permit.softFacilitiesApproval.date,
    },
    {
      key: 'hard_facilities',
      label: 'Hard Facilities',
      required: isStepRequired('hard_facilities'),
      status: isStepRequired('hard_facilities') ? getStepStatus(permit.hardFacilitiesApproval) : 'skipped',
      approver: permit.hardFacilitiesApproval.approverName,
      date: permit.hardFacilitiesApproval.date,
    },
    {
      key: 'pm_service',
      label: 'PM Service Provider',
      required: true,
      status: getStepStatus(permit.pmServiceApproval),
      approver: permit.pmServiceApproval.approverName,
      date: permit.pmServiceApproval.date,
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
