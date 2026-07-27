import { GitBranch, Check } from 'lucide-react';

/**
 * Read-only confirmation shown where the manual work-type picker used to be,
 * once the workflow is resolved automatically from the request purpose. Keeps
 * the requester informed (which approval cycle this follows) without asking
 * them to choose it.
 */
export function AutoWorkflowChip({ workTypeName }: { workTypeName: string }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start gap-2.5">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="h-3 w-3" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          Approval workflow selected automatically
        </p>
        <p className="text-xs text-muted-foreground">
          Based on your chosen purpose, this request follows the{' '}
          <span className="font-medium text-foreground">{workTypeName}</span> approval cycle.
        </p>
      </div>
    </div>
  );
}
