import { cn } from '@/lib/utils';
import { Check, X, Clock, Circle } from 'lucide-react';
import { WorkPermit } from '@/types/workPermit';

interface WorkflowTimelineProps {
  permit: WorkPermit;
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

export function WorkflowTimeline({ permit, className }: WorkflowTimelineProps) {
  const getStepStatus = (approval: { status: 'pending' | 'approved' | 'rejected' | null }) => {
    if (approval.status === 'approved') return 'completed';
    if (approval.status === 'rejected') return 'rejected';
    if (approval.status === 'pending') return 'pending';
    return 'upcoming';
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
      required: true,
      status: getStepStatus(permit.pmApproval),
      approver: permit.pmApproval.approverName,
      date: permit.pmApproval.date,
    },
    {
      key: 'pd',
      label: 'PD Approval',
      required: permit.pdApproval.status !== null,
      status: permit.pdApproval.status !== null ? getStepStatus(permit.pdApproval) : 'skipped',
      approver: permit.pdApproval.approverName,
      date: permit.pdApproval.date,
    },
    {
      key: 'bdcr',
      label: 'BDCR Approval',
      required: permit.bdcrApproval.status !== null,
      status: permit.bdcrApproval.status !== null ? getStepStatus(permit.bdcrApproval) : 'skipped',
      approver: permit.bdcrApproval.approverName,
      date: permit.bdcrApproval.date,
    },
    {
      key: 'mpr',
      label: 'MPR Approval',
      required: permit.mprApproval.status !== null,
      status: permit.mprApproval.status !== null ? getStepStatus(permit.mprApproval) : 'skipped',
      approver: permit.mprApproval.approverName,
      date: permit.mprApproval.date,
    },
    {
      key: 'it',
      label: 'IT Approval',
      required: permit.itApproval.status !== null,
      status: permit.itApproval.status !== null ? getStepStatus(permit.itApproval) : 'skipped',
      approver: permit.itApproval.approverName,
      date: permit.itApproval.date,
    },
    {
      key: 'fitout',
      label: 'Fit-Out Approval',
      required: permit.fitoutApproval.status !== null,
      status: permit.fitoutApproval.status !== null ? getStepStatus(permit.fitoutApproval) : 'skipped',
      approver: permit.fitoutApproval.approverName,
      date: permit.fitoutApproval.date,
    },
    {
      key: 'soft_facilities',
      label: 'Soft Facilities',
      required: permit.softFacilitiesApproval.status !== null,
      status: permit.softFacilitiesApproval.status !== null ? getStepStatus(permit.softFacilitiesApproval) : 'skipped',
      approver: permit.softFacilitiesApproval.approverName,
      date: permit.softFacilitiesApproval.date,
    },
    {
      key: 'hard_facilities',
      label: 'Hard Facilities',
      required: permit.hardFacilitiesApproval.status !== null,
      status: permit.hardFacilitiesApproval.status !== null ? getStepStatus(permit.hardFacilitiesApproval) : 'skipped',
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
