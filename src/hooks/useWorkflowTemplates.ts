import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WorkflowTemplate {
  id: string;
  name: string;
  workflow_type: 'internal' | 'client';
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  id: string;
  workflow_template_id: string;
  role_id: string;
  step_order: number;
  is_required_default: boolean;
  can_be_skipped: boolean;
  step_name: string | null;
  created_at: string;
  updated_at: string;
  role?: {
    id: string;
    name: string;
    label: string;
  };
}

export interface WorkTypeStepConfig {
  id: string;
  work_type_id: string;
  workflow_step_id: string;
  is_required: boolean;
  created_at: string;
}

// Fetch all workflow templates
export function useWorkflowTemplates(workflowType?: 'internal' | 'client') {
  return useQuery({
    queryKey: ['workflow-templates', workflowType],
    queryFn: async () => {
      let query = supabase
        .from('workflow_templates')
        .select('*')
        .order('workflow_type')
        .order('name');

      if (workflowType) {
        query = query.eq('workflow_type', workflowType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as WorkflowTemplate[];
    },
  });
}

// Fetch a single workflow template with its steps
export function useWorkflowTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;
      return data as WorkflowTemplate;
    },
    enabled: !!templateId,
  });
}

// Fetch workflow steps for a template
export function useWorkflowSteps(templateId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-steps', templateId],
    queryFn: async () => {
      if (!templateId) return [];

      const { data, error } = await supabase
        .from('workflow_steps')
        .select(`
          *,
          role:roles(id, name, label)
        `)
        .eq('workflow_template_id', templateId)
        .order('step_order');

      if (error) throw error;
      return data as WorkflowStep[];
    },
    enabled: !!templateId,
  });
}

// Fetch work type step configurations
export function useWorkTypeStepConfig(workTypeId: string | undefined) {
  return useQuery({
    queryKey: ['work-type-step-config', workTypeId],
    queryFn: async () => {
      if (!workTypeId) return [];

      const { data, error } = await supabase
        .from('work_type_step_config')
        .select('*')
        .eq('work_type_id', workTypeId);

      if (error) throw error;
      return data as WorkTypeStepConfig[];
    },
    enabled: !!workTypeId,
  });
}

// Create workflow template
export function useCreateWorkflowTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: {
      name: string;
      workflow_type: 'internal' | 'client';
      description?: string;
      is_default?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .insert({
          name: template.name,
          workflow_type: template.workflow_type,
          description: template.description || null,
          is_default: template.is_default || false,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast.success('Workflow template created successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to create workflow template: ' + error.message);
    },
  });
}

// Update workflow template
export function useUpdateWorkflowTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
      is_default?: boolean;
    }) => {
      // If activating the template, validate it first
      if (updates.is_active === true) {
        const validation = await validateWorkflowTemplate(id);
        if (!validation.valid) {
          throw new Error('Cannot activate workflow: ' + validation.errors.join(', '));
        }
      }

      const { data, error } = await supabase
        .from('workflow_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-template'] });
      toast.success('Workflow template updated successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to update workflow template: ' + error.message);
    },
  });
}

// Delete workflow template
export function useDeleteWorkflowTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workflow_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast.success('Workflow template deleted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete workflow template: ' + error.message);
    },
  });
}

// Validate workflow template - check all roles exist and are active
export async function validateWorkflowTemplate(templateId: string): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Fetch workflow steps with roles
  const { data: steps, error: stepsError } = await supabase
    .from('workflow_steps')
    .select(`
      *,
      role:roles(id, name, label, is_active)
    `)
    .eq('workflow_template_id', templateId)
    .order('step_order');

  if (stepsError) {
    errors.push('Failed to fetch workflow steps: ' + stepsError.message);
    return { valid: false, errors, warnings };
  }

  if (!steps || steps.length === 0) {
    errors.push('Workflow has no steps defined');
    return { valid: false, errors, warnings };
  }

  // Check each step has a valid role
  for (const step of steps) {
    if (!step.role) {
      errors.push(`Step ${step.step_order}: Role not found (ID: ${step.role_id})`);
    } else if (step.role.is_active === false) {
      warnings.push(`Step ${step.step_order} (${step.role.label}): Role is inactive`);
    }
  }

  // Check for duplicate step orders
  const orderCounts = new Map<number, number>();
  for (const step of steps) {
    orderCounts.set(step.step_order, (orderCounts.get(step.step_order) || 0) + 1);
  }
  for (const [order, count] of orderCounts) {
    if (count > 1) {
      errors.push(`Multiple steps have the same order (${order})`);
    }
  }

  // Check for at least one required step
  const hasRequiredStep = steps.some(s => s.is_required_default);
  if (!hasRequiredStep) {
    warnings.push('No steps are marked as required by default');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Hook to validate a workflow template
export function useValidateWorkflowTemplate() {
  return useMutation({
    mutationFn: async (templateId: string) => {
      return validateWorkflowTemplate(templateId);
    },
  });
}

// Add workflow step
export function useAddWorkflowStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (step: {
      workflow_template_id: string;
      role_id: string;
      step_order: number;
      is_required_default?: boolean;
      can_be_skipped?: boolean;
      step_name?: string;
    }) => {
      // Validate role exists and is active
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('id, name, label, is_active')
        .eq('id', step.role_id)
        .single();

      if (roleError || !role) {
        throw new Error('Selected role does not exist');
      }

      if (role.is_active === false) {
        throw new Error(`Role "${role.label}" is inactive and cannot be added to workflows`);
      }

      const { data, error } = await supabase
        .from('workflow_steps')
        .insert({
          workflow_template_id: step.workflow_template_id,
          role_id: step.role_id,
          step_order: step.step_order,
          is_required_default: step.is_required_default ?? true,
          can_be_skipped: step.can_be_skipped ?? false,
          step_name: step.step_name || null,
        })
        .select(`
          *,
          role:roles(id, name, label)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-steps', variables.workflow_template_id] });
      toast.success('Step added successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to add step: ' + error.message);
    },
  });
}

// Update workflow step
export function useUpdateWorkflowStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      templateId,
      ...updates
    }: {
      id: string;
      templateId: string;
      step_order?: number;
      is_required_default?: boolean;
      can_be_skipped?: boolean;
      step_name?: string;
    }) => {
      const { data, error } = await supabase
        .from('workflow_steps')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, templateId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-steps', data.templateId] });
      toast.success('Step updated successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to update step: ' + error.message);
    },
  });
}

// Delete workflow step
export function useDeleteWorkflowStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
      const { error } = await supabase
        .from('workflow_steps')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { templateId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-steps', data.templateId] });
      toast.success('Step removed successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to remove step: ' + error.message);
    },
  });
}

// Reorder workflow steps
export function useReorderWorkflowSteps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      steps,
    }: {
      templateId: string;
      steps: { id: string; step_order: number }[];
    }) => {
      // To avoid unique constraint violations, first set all step_orders to temporary high values
      const tempOffset = 10000;
      for (const step of steps) {
        const { error } = await supabase
          .from('workflow_steps')
          .update({ step_order: step.step_order + tempOffset })
          .eq('id', step.id);

        if (error) throw error;
      }

      // Now set the final step_order values
      for (const step of steps) {
        const { error } = await supabase
          .from('workflow_steps')
          .update({ step_order: step.step_order })
          .eq('id', step.id);

        if (error) throw error;
      }
      return { templateId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-steps', data.templateId] });
      toast.success('Steps reordered successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to reorder steps: ' + error.message);
    },
  });
}

// Update work type step configuration
export function useUpdateWorkTypeStepConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workTypeId,
      workflowStepId,
      isRequired,
    }: {
      workTypeId: string;
      workflowStepId: string;
      isRequired: boolean;
    }) => {
      // Upsert the configuration
      const { data, error } = await supabase
        .from('work_type_step_config')
        .upsert(
          {
            work_type_id: workTypeId,
            workflow_step_id: workflowStepId,
            is_required: isRequired,
          },
          { onConflict: 'work_type_id,workflow_step_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return { ...data, workTypeId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['work-type-step-config', data.workTypeId] });
      toast.success('Step configuration updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update configuration: ' + error.message);
    },
  });
}

// Get effective workflow for a work type
export function useEffectiveWorkflow(workTypeId: string | undefined) {
  return useQuery({
    queryKey: ['effective-workflow', workTypeId],
    queryFn: async () => {
      if (!workTypeId) return null;

      // Get work type with its workflow template
      const { data: workType, error: workTypeError } = await supabase
        .from('work_types')
        .select('*, workflow_template:workflow_templates(*)')
        .eq('id', workTypeId)
        .single();

      if (workTypeError) throw workTypeError;
      if (!workType.workflow_template_id) return null;

      // Get workflow steps
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_steps')
        .select(`
          *,
          role:roles(id, name, label)
        `)
        .eq('workflow_template_id', workType.workflow_template_id)
        .order('step_order');

      if (stepsError) throw stepsError;

      // Get work type step overrides
      const { data: configs, error: configsError } = await supabase
        .from('work_type_step_config')
        .select('*')
        .eq('work_type_id', workTypeId);

      if (configsError) throw configsError;

      // Build effective steps with overrides applied
      const configMap = new Map(configs?.map(c => [c.workflow_step_id, c]) || []);
      
      const effectiveSteps = steps.map(step => {
        const config = configMap.get(step.id);
        return {
          ...step,
          is_required: config ? config.is_required : step.is_required_default,
        };
      });

      return {
        template: workType.workflow_template as unknown as WorkflowTemplate,
        steps: effectiveSteps,
      };
    },
    enabled: !!workTypeId,
  });
}
