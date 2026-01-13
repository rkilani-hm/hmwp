import { cn } from '@/lib/utils';
import { Check, X, Clock, Circle, Loader2 } from 'lucide-react';
import { PermitStatus } from '@/types/workPermit';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  work_type_id?: string | null;
  is_internal?: boolean | null;
  helpdeskApproval: ApprovalRecord;
  pmApproval: ApprovalRecord;
  pdApproval: ApprovalRecord;
  bdcrApproval: ApprovalRecord;
  mprApproval: ApprovalRecord;
  itApproval: ApprovalRecord;
  fitoutApproval: ApprovalRecord;
  ecovertSupervisorApproval: ApprovalRecord;
  pmdCoordinatorApproval: ApprovalRecord;
  customerServiceApproval?: ApprovalRecord;
  crCoordinatorApproval?: ApprovalRecord;
  headCrApproval?: ApprovalRecord;
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
  comments?: string | null;
}

interface WorkflowStep {
  id: string;
  step_name: string | null;
  step_order: number;
  role_id: string;
  is_required_default: boolean | null;
  can_be_skipped: boolean | null;
  roles: {
    id: string;
    name: string;
    label: string;
  } | null;
}

interface WorkTypeStepConfig {
  workflow_step_id: string;
  is_required: boolean;
}

// Role name to approval record mapping
const ROLE_TO_APPROVAL_KEY: Record<string, keyof WorkflowPermit> = {
  'customer_service': 'customerServiceApproval',
  'cr_coordinator': 'crCoordinatorApproval',
  'head_cr': 'headCrApproval',
  'helpdesk': 'helpdeskApproval',
  'pm': 'pmApproval',
  'pd': 'pdApproval',
  'bdcr': 'bdcrApproval',
  'mpr': 'mprApproval',
  'it': 'itApproval',
  'fitout': 'fitoutApproval',
  'ecovert_supervisor': 'ecovertSupervisorApproval',
  'pmd_coordinator': 'pmdCoordinatorApproval',
};

export function WorkflowTimeline({ permit, workTypeRequirements, className }: WorkflowTimelineProps) {
  // Fetch workflow steps dynamically from database
  const { data: workflowData, isLoading } = useQuery({
    queryKey: ['workflow-timeline-steps', permit.work_type_id],
    queryFn: async () => {
      if (!permit.work_type_id) {
        return { steps: [], configs: [], workType: null, template: null };
      }

      // Fetch work type with template
      const { data: workType, error: workTypeError } = await supabase
        .from('work_types')
        .select('*, workflow_templates(*)')
        .eq('id', permit.work_type_id)
        .single();

      if (workTypeError || !workType?.workflow_template_id) {
        return { steps: [], configs: [], workType, template: null };
      }

      // Fetch workflow steps with roles
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_steps')
        .select('*, roles:role_id(id, name, label)')
        .eq('workflow_template_id', workType.workflow_template_id)
        .order('step_order', { ascending: true });

      if (stepsError) {
        console.error('Error fetching workflow steps:', stepsError);
        return { steps: [], configs: [], workType, template: workType.workflow_templates };
      }

      // Fetch work type step configs
      const { data: configs, error: configsError } = await supabase
        .from('work_type_step_config')
        .select('*')
        .eq('work_type_id', permit.work_type_id);

      if (configsError) {
        console.error('Error fetching step configs:', configsError);
      }

      return {
        steps: (steps || []) as WorkflowStep[],
        configs: (configs || []) as WorkTypeStepConfig[],
        workType,
        template: workType.workflow_templates,
      };
    },
    enabled: !!permit.work_type_id,
  });

  const getStepStatus = (approval: { status: 'pending' | 'approved' | 'rejected' | null } | undefined) => {
    if (!approval) return 'upcoming';
    if (approval.status === 'approved') return 'completed';
    if (approval.status === 'rejected') return 'rejected';
    if (approval.status === 'pending') return 'pending';
    return 'upcoming';
  };

  // Check if step is required based on dynamic config, legacy fields, or work type requirements
  const isDynamicStepRequired = (step: WorkflowStep): boolean => {
    if (!workflowData || !step.roles) return true;
    
    // Check work type step config first
    const config = workflowData.configs.find(c => c.workflow_step_id === step.id);
    if (config !== undefined) {
      return config.is_required;
    }
    
    // Check legacy requires_* fields on work type
    const workType = workflowData.workType;
    if (workType) {
      const roleName = step.roles.name;
      const legacyField = `requires_${roleName}` as keyof typeof workType;
      if (legacyField in workType && workType[legacyField] !== null) {
        return workType[legacyField] as boolean;
      }
    }
    
    return step.is_required_default ?? true;
  };

  // Legacy step requirement check
  const isLegacyStepRequired = (key: string): boolean => {
    if (key === 'submitted' || key === 'helpdesk' || key === 'customer_service') return true;
    
    if (!workTypeRequirements) {
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

  // Build dynamic timeline steps from workflow template
  const buildDynamicTimelineSteps = (): TimelineStep[] => {
    if (!workflowData?.steps.length) return [];

    // Add submitted step
    const dynamicSteps: TimelineStep[] = [
      {
        key: 'submitted',
        label: 'Submitted',
        required: true,
        status: permit.status !== 'draft' ? 'completed' : 'upcoming',
      },
    ];

    workflowData.steps.forEach(step => {
      if (!step.roles) return;
      
      const roleName = step.roles.name;
      const approvalKey = ROLE_TO_APPROVAL_KEY[roleName];
      const approval = approvalKey ? permit[approvalKey] as ApprovalRecord | undefined : undefined;
      const isRequired = isDynamicStepRequired(step);
      
      let status: TimelineStep['status'] = 'upcoming';
      if (!isRequired) {
        status = 'skipped';
      } else if (approval) {
        status = getStepStatus(approval);
        // Check if this is the current pending step based on permit status
        if (status === 'upcoming' && permit.status === `pending_${roleName}`) {
          status = 'pending';
        }
      }

      dynamicSteps.push({
        key: step.id,
        label: step.step_name || step.roles.label,
        required: isRequired,
        status,
        approver: approval?.approverName,
        date: approval?.date,
        comments: approval?.comments,
      });
    });

    return dynamicSteps;
  };

  // Build legacy timeline steps (fallback)
  const buildLegacyTimelineSteps = (): TimelineStep[] => {
    // Determine if client workflow based on is_internal flag
    const isClientWorkflow = permit.is_internal === false;

    const baseSteps: TimelineStep[] = [
      {
        key: 'submitted',
        label: 'Submitted',
        required: true,
        status: permit.status !== 'draft' ? 'completed' : 'upcoming',
      },
    ];

    if (isClientWorkflow) {
      // Client workflow: Customer Service → CR Coordinator → Head CR → PM → Departments
      baseSteps.push(
        {
          key: 'customer_service',
          label: 'Customer Service',
          required: true,
          status: getStepStatus(permit.customerServiceApproval),
          approver: permit.customerServiceApproval?.approverName,
          date: permit.customerServiceApproval?.date,
        },
        {
          key: 'cr_coordinator',
          label: 'CR Coordinator',
          required: true,
          status: getStepStatus(permit.crCoordinatorApproval),
          approver: permit.crCoordinatorApproval?.approverName,
          date: permit.crCoordinatorApproval?.date,
        },
        {
          key: 'head_cr',
          label: 'Head of CR',
          required: true,
          status: getStepStatus(permit.headCrApproval),
          approver: permit.headCrApproval?.approverName,
          date: permit.headCrApproval?.date,
        }
      );
    } else {
      // Internal workflow: Helpdesk first
      baseSteps.push({
        key: 'helpdesk',
        label: 'Helpdesk Review',
        required: true,
        status: getStepStatus(permit.helpdeskApproval),
        approver: permit.helpdeskApproval.approverName,
        date: permit.helpdeskApproval.date,
      });
    }

    // Common department approvals
    const departmentSteps: Array<{ key: string; label: string; approval: ApprovalRecord }> = [
      { key: 'pm', label: 'PM Approval', approval: permit.pmApproval },
      { key: 'pd', label: 'PD Approval', approval: permit.pdApproval },
      { key: 'bdcr', label: 'BDCR Approval', approval: permit.bdcrApproval },
      { key: 'mpr', label: 'MPR Approval', approval: permit.mprApproval },
      { key: 'it', label: 'IT Approval', approval: permit.itApproval },
      { key: 'fitout', label: 'Fit-Out Approval', approval: permit.fitoutApproval },
      { key: 'ecovert_supervisor', label: 'Ecovert Supervisor', approval: permit.ecovertSupervisorApproval },
      { key: 'pmd_coordinator', label: 'PMD Coordinator', approval: permit.pmdCoordinatorApproval },
    ];

    departmentSteps.forEach(({ key, label, approval }) => {
      const isRequired = isLegacyStepRequired(key);
      baseSteps.push({
        key,
        label,
        required: isRequired,
        status: isRequired ? getStepStatus(approval) : 'skipped',
        approver: approval.approverName,
        date: approval.date,
      });
    });

    return baseSteps;
  };

  // Use dynamic steps if available, otherwise fall back to legacy
  const steps = workflowData?.steps.length ? buildDynamicTimelineSteps() : buildLegacyTimelineSteps();
  const visibleSteps = steps.filter(step => step.status !== 'skipped');

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-0', className)}>
      {workflowData?.template && (
        <p className="text-xs text-muted-foreground mb-3">
          Workflow: {(workflowData.template as { name: string }).name}
        </p>
      )}
      
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
            {step.comments && step.status === 'rejected' && (
              <p className="text-xs text-destructive mt-1">
                {step.comments}
              </p>
            )}
          </div>
        </div>
      ))}

      {visibleSteps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No workflow steps configured
        </p>
      )}
    </div>
  );
}
