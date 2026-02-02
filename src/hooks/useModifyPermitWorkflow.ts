import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ModifyWorkflowParams {
  permitId: string;
  modificationType: 'work_type_change' | 'custom_flow';
  newWorkTypeId?: string;
  customSteps?: { stepId: string; isRequired: boolean }[];
  reason: string;
  password: string;
}

export function useModifyPermitWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ModifyWorkflowParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modify-permit-workflow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(params),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to modify workflow');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-workflow-overrides', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-workflow-audit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Workflow modified successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to modify workflow');
    },
  });
}
