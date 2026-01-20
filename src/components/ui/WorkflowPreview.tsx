import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, Circle, ArrowRight, MapPin, Store, Users, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffectiveWorkflow } from '@/hooks/useWorkflowTemplates';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkType {
  id: string;
  name: string;
  workflow_template_id?: string | null;
  // Legacy fields for backward compatibility
  requires_pm?: boolean;
  requires_pd?: boolean;
  requires_bdcr?: boolean;
  requires_mpr?: boolean;
  requires_it?: boolean;
  requires_fitout?: boolean;
  requires_ecovert_supervisor?: boolean;
  requires_pmd_coordinator?: boolean;
}

interface WorkLocation {
  id: string;
  name: string;
  location_type: 'shop' | 'common';
}

interface WorkflowPreviewProps {
  workType?: WorkType | null;
  workLocation?: WorkLocation | null;
  isOtherLocation?: boolean;
  className?: string;
}

interface DisplayStep {
  key: string;
  label: string;
  shortLabel: string;
  required: boolean;
  isLocationBased?: boolean;
  locationType?: 'shop' | 'common';
}

// Role name to short label mapping
const roleShortLabels: Record<string, string> = {
  customer_service: 'CS',
  cr_coordinator: 'CRC',
  head_cr: 'HCR',
  helpdesk: 'HD',
  pm: 'PM',
  pd: 'PD',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT',
  fitout: 'FIT',
  ecovert_supervisor: 'ECO',
  pmd_coordinator: 'PMD',
  fmsp_approval: 'FMSP',
  soft_facilities: 'SF',
  hard_facilities: 'HF',
  pm_service: 'PMS',
};

export function WorkflowPreview({ 
  workType, 
  workLocation, 
  isOtherLocation = false,
  className 
}: WorkflowPreviewProps) {
  // Determine location type - default to 'shop' for "Other" locations
  const locationType = workLocation?.location_type || (isOtherLocation ? 'shop' : null);

  // Fetch dynamic workflow from database
  const { data: effectiveWorkflow, isLoading } = useEffectiveWorkflow(workType?.id);

  const requiredSteps = (effectiveWorkflow?.steps ?? []).filter((s) => s.is_required);
  const hasDynamicWorkflow = requiredSteps.length > 0;

  // Build workflow steps - dynamic only (no legacy fallback)
  const buildWorkflowSteps = (): DisplayStep[] => {
    if (!hasDynamicWorkflow) return [];

    const steps: DisplayStep[] = [{ key: 'submit', label: 'Submit', shortLabel: 'SUB', required: true }];

    requiredSteps.forEach((step) => {
      const roleName = step.role?.name || '';
      const roleLabel = step.role?.label || step.step_name || roleName;

      steps.push({
        key: step.id,
        label: roleLabel,
        shortLabel: roleShortLabels[roleName] || roleName.substring(0, 3).toUpperCase(),
        required: true,
        isLocationBased: roleName === 'pm' || roleName === 'pd',
        locationType: roleName === 'pm' ? 'shop' : roleName === 'pd' ? 'common' : undefined,
      });
    });

    steps.push({ key: 'approved', label: 'Approved', shortLabel: '✓', required: true });

    return steps;
  };

  // Show placeholder if nothing selected
  if (!workType && !workLocation && !isOtherLocation) {
    return (
      <div className={cn("p-4 rounded-lg border border-dashed bg-muted/30", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Info className="h-4 w-4" />
          <span className="text-sm">Select a work location and work type to see the approval workflow</span>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading && workType?.id) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading workflow...</span>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center">
              <Skeleton className="w-8 h-8 rounded-full" />
              {i < 5 && <ArrowRight className="h-3 w-3 text-muted-foreground/30 mx-1" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No legacy fallback: require a configured dynamic workflow
  if (workType?.id && !hasDynamicWorkflow) {
    const templateName = effectiveWorkflow?.template?.name;

    return (
      <div className={cn("p-4 rounded-lg border border-dashed bg-muted/30", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Info className="h-4 w-4" />
          <span className="text-sm">
            {templateName
              ? `"${templateName}" has no required steps for this work type.`
              : 'No workflow is configured for this work type. Ask an admin to assign a workflow template in Workflow Builder.'}
          </span>
        </div>
      </div>
    );
  }

  const steps = buildWorkflowSteps();
  const approvalCount = steps.filter((s) => s.key !== 'submit' && s.key !== 'approved').length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with routing info */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Approval Workflow</span>
          <Badge variant="outline" className="text-xs">
            {approvalCount} approval{approvalCount !== 1 ? 's' : ''} required
          </Badge>
          {effectiveWorkflow?.template && (
            <Badge variant="secondary" className="text-xs">
              {effectiveWorkflow.template.name}
            </Badge>
          )}
        </div>
        {locationType && (
          <Badge 
            variant={locationType === 'shop' ? 'default' : 'secondary'} 
            className="text-xs"
          >
            {locationType === 'shop' ? (
              <><Store className="h-3 w-3 mr-1" /> Shop/Office → PM First</>
            ) : (
              <><Users className="h-3 w-3 mr-1" /> Common Area → PD First</>
            )}
          </Badge>
        )}
      </div>

      {/* Workflow Timeline - Matching Workflow Builder Style */}
      <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg overflow-x-auto">
        <AnimatePresence mode="popLayout">
          {steps.map((step, index) => (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="flex items-center"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center min-w-max">
                    <Badge 
                      variant={step.key === 'approved' ? 'default' : step.key === 'submit' ? 'secondary' : 'default'}
                      className={cn(
                        step.key === 'approved' && "bg-success hover:bg-success/90 text-success-foreground",
                        step.isLocationBased && "ring-2 ring-primary/30"
                      )}
                    >
                      {step.key === 'approved' ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Approved
                        </span>
                      ) : (
                        step.label
                      )}
                    </Badge>
                    <span className="text-xs text-muted-foreground mt-1">
                      Step {index + 1}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="font-medium">{step.label}</p>
                  {step.isLocationBased && (
                    <p className="text-xs text-muted-foreground">
                      First approver based on {step.locationType === 'shop' ? 'Shop/Office' : 'Common Area'} location
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
              
              {index < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-2 flex-shrink-0" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Legend */}
      {locationType && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-primary/10 ring-1 ring-primary/20" />
            <span>Location-based routing</span>
          </div>
          {isOtherLocation && (
            <div className="flex items-center gap-1">
              <Info className="h-3 w-3" />
              <span>"Other" locations default to PM routing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}