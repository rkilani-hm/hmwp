import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Loader2 } from 'lucide-react';
import { useGatePassEffectiveWorkflow } from '@/hooks/useGatePassTypeWorkflows';
import type { GatePassType } from '@/types/gatePass';

interface Props {
  passType: GatePassType | '';
}

/**
 * Compact preview of the approval path for a chosen pass type. Used
 * by CategoryStep, PurposeStep, and GenericReviewStep so the user
 * can see who'll review their submission at multiple points.
 */
export function WorkflowPreview({ passType }: Props) {
  const { data: effectiveWorkflow, isLoading } = useGatePassEffectiveWorkflow(
    passType || undefined,
  );

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-2 py-3 px-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading workflow...</span>
        </CardContent>
      </Card>
    );
  }

  if (!effectiveWorkflow) {
    return (
      <Card className="border-dashed">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            Approval Path
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-sm text-muted-foreground mb-2">
            Default flow (no custom workflow assigned):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">1. Store Manager</Badge>
            <span className="text-muted-foreground text-xs">→</span>
            <Badge variant="outline" className="text-xs text-warning">
              2. Finance (if high-value)
            </Badge>
            <span className="text-muted-foreground text-xs">→</span>
            <Badge variant="outline" className="text-xs">3. Security</Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          Approval Path: {effectiveWorkflow.template.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {effectiveWorkflow.steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <Badge
                variant={step.is_required_default ? 'default' : 'outline'}
                className="text-xs"
              >
                {i + 1}. {step.role?.label || step.step_name || 'Unknown'}
                {!step.is_required_default && ' (optional)'}
              </Badge>
              {i < effectiveWorkflow.steps.length - 1 && (
                <span className="text-muted-foreground text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
