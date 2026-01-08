import * as React from 'react';
import { cn } from '@/lib/utils';
import { PermitStatus, statusLabels } from '@/types/workPermit';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: PermitStatus;
}

const statusStyles: Record<PermitStatus, string> = {
  draft: 'bg-status-draft/10 text-status-draft border-status-draft/30',
  submitted: 'bg-status-submitted/10 text-status-submitted border-status-submitted/30',
  under_review: 'bg-status-review/10 text-status-review border-status-review/30',
  rework_needed: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  pending_pm: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_pd: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_bdcr: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_mpr: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_it: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_fitout: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_ecovert_supervisor: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_pmd_coordinator: 'bg-status-review/10 text-status-review border-status-review/30',
  approved: 'bg-status-approved/10 text-status-approved border-status-approved/30',
  rejected: 'bg-status-rejected/10 text-status-rejected border-status-rejected/30',
  closed: 'bg-status-closed/10 text-status-closed border-status-closed/30',
  cancelled: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
          statusStyles[status],
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full mr-1.5',
            status === 'approved' && 'bg-status-approved',
            status === 'rejected' && 'bg-status-rejected',
            status === 'closed' && 'bg-status-closed',
            status === 'submitted' && 'bg-status-submitted',
            status === 'draft' && 'bg-status-draft',
            status === 'cancelled' && 'bg-muted-foreground',
            status === 'rework_needed' && 'bg-orange-500 animate-pulse-soft',
            status.startsWith('pending') && 'bg-status-review animate-pulse-soft',
            status === 'under_review' && 'bg-status-review animate-pulse-soft'
          )}
        />
        {statusLabels[status]}
      </span>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';
