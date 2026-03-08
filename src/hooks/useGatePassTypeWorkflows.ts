import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GatePassTypeWorkflow {
  id: string;
  pass_type: string;
  workflow_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useGatePassTypeWorkflows() {
  return useQuery({
    queryKey: ['gate-pass-type-workflows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gate_pass_type_workflows')
        .select('*')
        .order('pass_type');
      if (error) throw error;
      return data as GatePassTypeWorkflow[];
    },
  });
}

export function useGatePassTypeWorkflow(passType: string | undefined) {
  return useQuery({
    queryKey: ['gate-pass-type-workflow', passType],
    queryFn: async () => {
      if (!passType) return null;
      const { data, error } = await supabase
        .from('gate_pass_type_workflows')
        .select('*')
        .eq('pass_type', passType)
        .maybeSingle();
      if (error) throw error;
      return data as GatePassTypeWorkflow | null;
    },
    enabled: !!passType,
  });
}

export function useUpdateGatePassTypeWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      passType,
      workflowTemplateId,
    }: {
      passType: string;
      workflowTemplateId: string | null;
    }) => {
      const { data, error } = await supabase
        .from('gate_pass_type_workflows')
        .update({ workflow_template_id: workflowTemplateId, updated_at: new Date().toISOString() })
        .eq('pass_type', passType)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-pass-type-workflows'] });
      queryClient.invalidateQueries({ queryKey: ['gate-pass-type-workflow'] });
      toast.success('Workflow mapping updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update mapping: ' + error.message);
    },
  });
}

// Get the effective workflow for a gate pass type (template + steps)
export function useGatePassEffectiveWorkflow(passType: string | undefined) {
  return useQuery({
    queryKey: ['gate-pass-effective-workflow', passType],
    queryFn: async () => {
      if (!passType) return null;

      // Get the mapping
      const { data: mapping, error: mapError } = await supabase
        .from('gate_pass_type_workflows')
        .select('*')
        .eq('pass_type', passType)
        .maybeSingle();
      if (mapError) throw mapError;
      if (!mapping?.workflow_template_id) return null;

      // Get the template
      const { data: template, error: tplError } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('id', mapping.workflow_template_id)
        .single();
      if (tplError) throw tplError;

      // Get the steps
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_steps')
        .select(`*, role:roles(id, name, label)`)
        .eq('workflow_template_id', mapping.workflow_template_id)
        .order('step_order');
      if (stepsError) throw stepsError;

      return { template, steps };
    },
    enabled: !!passType,
  });
}
