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
  
  // Build workflow steps - use dynamic data if available, otherwise fall back to legacy logic
  const buildWorkflowSteps = (): DisplayStep[] => {
    // If we have dynamic workflow data from database, use it
    if (effectiveWorkflow?.steps && effectiveWorkflow.steps.length > 0) {
      const steps: DisplayStep[] = [
        { key: 'submit', label: 'Submit', shortLabel: 'SUB', required: true },
      ];

      // Add steps from dynamic workflow
      effectiveWorkflow.steps.forEach((step) => {
        if (!step.is_required) return; // Skip non-required steps
        
        const roleName = step.role?.name || '';
        const roleLabel = step.role?.label || step.step_name || roleName;
        
        steps.push({
          key: step.id,
          label: roleLabel,
          shortLabel: roleShortLabels[roleName] || roleName.substring(0, 3).toUpperCase(),
          required: step.is_required,
          isLocationBased: roleName === 'pm' || roleName === 'pd',
          locationType: roleName === 'pm' ? 'shop' : roleName === 'pd' ? 'common' : undefined,
        });
      });

      // Final approval
      steps.push({ key: 'approved', label: 'Approved', shortLabel: '✓', required: true });

      return steps;
    }

    // Legacy fallback: build steps from work type flags
    const steps: DisplayStep[] = [
      { key: 'submit', label: 'Submit', shortLabel: 'SUB', required: true },
      { key: 'helpdesk', label: 'Helpdesk Review', shortLabel: 'HD', required: true },
    ];

    // Location-based routing (PM or PD after Helpdesk)
    if (locationType === 'shop') {
      steps.push({ 
        key: 'pm', 
        label: 'Property Management', 
        shortLabel: 'PM', 
        required: true,
        isLocationBased: true,
        locationType: 'shop'
      });
      // PD is skipped for shop locations unless work type requires it
      if (workType?.requires_pd) {
        steps.push({ 
          key: 'pd', 
          label: 'Project Development', 
          shortLabel: 'PD', 
          required: true 
        });
      }
    } else if (locationType === 'common') {
      // PM is skipped for common locations unless work type requires it
      if (workType?.requires_pm) {
        steps.push({ 
          key: 'pm', 
          label: 'Property Management', 
          shortLabel: 'PM', 
          required: true 
        });
      }
      steps.push({ 
        key: 'pd', 
        label: 'Project Development', 
        shortLabel: 'PD', 
        required: true,
        isLocationBased: true,
        locationType: 'common'
      });
    } else {
      // No location selected - show both as conditional
      if (workType?.requires_pm) {
        steps.push({ key: 'pm', label: 'Property Management', shortLabel: 'PM', required: true });
      }
      if (workType?.requires_pd) {
        steps.push({ key: 'pd', label: 'Project Development', shortLabel: 'PD', required: true });
      }
    }

    // Work type based approvers
    if (workType?.requires_bdcr) {
      steps.push({ key: 'bdcr', label: 'BDCR Review', shortLabel: 'BDCR', required: true });
    }
    if (workType?.requires_mpr) {
      steps.push({ key: 'mpr', label: 'MPR Review', shortLabel: 'MPR', required: true });
    }
    if (workType?.requires_it) {
      steps.push({ key: 'it', label: 'IT Department', shortLabel: 'IT', required: true });
    }
    if (workType?.requires_fitout) {
      steps.push({ key: 'fitout', label: 'Fit-Out Team', shortLabel: 'FIT', required: true });
    }
    if (workType?.requires_ecovert_supervisor) {
      steps.push({ key: 'ecovert', label: 'Ecovert Supervisor', shortLabel: 'ECO', required: true });
    }
    if (workType?.requires_pmd_coordinator) {
      steps.push({ key: 'pmd', label: 'PMD Coordinator', shortLabel: 'PMD', required: true });
    }

    // Final approval
    steps.push({ key: 'approved', label: 'Approved', shortLabel: '✓', required: true });

    return steps;
  };

  const steps = buildWorkflowSteps();
  const approvalCount = steps.filter(s => s.key !== 'submit' && s.key !== 'approved').length;

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

      {/* Workflow Timeline */}
      <div className="relative">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
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
                    <div 
                      className={cn(
                        "flex flex-col items-center gap-1 px-2 py-1 rounded-lg cursor-default transition-colors",
                        step.isLocationBased && "bg-primary/10 ring-1 ring-primary/20"
                      )}
                    >
                      <div 
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-all",
                          step.key === 'approved' 
                            ? "bg-success/20 border-success text-success"
                            : step.key === 'submit'
                            ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                            : "bg-primary/10 border-primary text-primary"
                        )}
                      >
                        {step.key === 'approved' ? (
                          <Check className="h-4 w-4" />
                        ) : step.key === 'submit' ? (
                          <Circle className="h-3 w-3" />
                        ) : (
                          step.shortLabel
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap max-w-[60px] truncate">
                        {step.label}
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
                  <ArrowRight className="h-3 w-3 text-muted-foreground/50 mx-1 flex-shrink-0" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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