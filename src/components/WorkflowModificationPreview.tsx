import { WorkflowStep } from '@/hooks/useWorkflowTemplates';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, ArrowRight, Equal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowModificationPreviewProps {
  currentSteps: WorkflowStep[];
  newSteps: WorkflowStep[];
  currentRequiredMap: Map<string, boolean>;
  newRequiredMap: Map<string, boolean>;
}

export function WorkflowModificationPreview({
  currentSteps,
  newSteps,
  currentRequiredMap,
  newRequiredMap,
}: WorkflowModificationPreviewProps) {
  // Build list of all steps (union of current and new)
  const allStepIds = new Set([
    ...currentSteps.map(s => s.id),
    ...newSteps.map(s => s.id),
  ]);

  const currentStepsMap = new Map(currentSteps.map(s => [s.id, s]));
  const newStepsMap = new Map(newSteps.map(s => [s.id, s]));

  // Sort by step_order
  const sortedSteps = [...allStepIds]
    .map(id => newStepsMap.get(id) || currentStepsMap.get(id))
    .filter(Boolean)
    .sort((a, b) => (a!.step_order || 0) - (b!.step_order || 0)) as WorkflowStep[];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center text-xs font-medium text-muted-foreground mb-2">
        <span>Current</span>
        <span></span>
        <span>New</span>
      </div>
      
      {sortedSteps.map(step => {
        const currentRequired = currentRequiredMap.get(step.id) ?? step.is_required_default;
        const newRequired = newRequiredMap.get(step.id) ?? step.is_required_default;
        const changed = currentRequired !== newRequired;
        const roleName = step.role?.label || step.step_name || 'Unknown';

        return (
          <div
            key={step.id}
            className={cn(
              "grid grid-cols-[1fr,auto,1fr] gap-2 items-center p-2 rounded-md text-sm",
              changed && "bg-accent/50"
            )}
          >
            {/* Current state */}
            <div className="flex items-center gap-2">
              {currentRequired ? (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Required
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <XCircle className="w-3 h-3 mr-1" />
                  Skipped
                </Badge>
              )}
              <span className="truncate">{roleName}</span>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center">
              {changed ? (
                <ArrowRight className="w-4 h-4 text-warning" />
              ) : (
                <Equal className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            {/* New state */}
            <div className="flex items-center gap-2">
              {newRequired ? (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Required
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <XCircle className="w-3 h-3 mr-1" />
                  Skipped
                </Badge>
              )}
              <span className="truncate">{roleName}</span>
            </div>
          </div>
        );
      })}

      {sortedSteps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No workflow steps to compare
        </p>
      )}
    </div>
  );
}
