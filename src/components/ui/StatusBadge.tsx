import { cn } from '@/lib/utils';
import { PermitStatus, statusLabels } from '@/types/workPermit';

interface StatusBadgeProps {
  status: PermitStatus;
  className?: string;
}

const statusStyles: Record<PermitStatus, string> = {
  draft: 'bg-status-draft/10 text-status-draft border-status-draft/30',
  submitted: 'bg-status-submitted/10 text-status-submitted border-status-submitted/30',
  under_review: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_pm: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_pd: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_bdcr: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_mpr: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_it: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_fitout: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_soft_facilities: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_hard_facilities: 'bg-status-review/10 text-status-review border-status-review/30',
  pending_pm_service: 'bg-status-review/10 text-status-review border-status-review/30',
  approved: 'bg-status-approved/10 text-status-approved border-status-approved/30',
  rejected: 'bg-status-rejected/10 text-status-rejected border-status-rejected/30',
  closed: 'bg-status-closed/10 text-status-closed border-status-closed/30',
  cancelled: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
        statusStyles[status],
        className
      )}
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
          status.startsWith('pending') && 'bg-status-review animate-pulse-soft',
          status === 'under_review' && 'bg-status-review animate-pulse-soft'
        )}
      />
      {statusLabels[status]}
    </span>
  );
}
