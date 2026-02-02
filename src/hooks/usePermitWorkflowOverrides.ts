import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PermitWorkflowOverride {
  id: string;
  permit_id: string;
  workflow_step_id: string;
  is_required: boolean;
  created_at: string;
  created_by: string | null;
}

export function usePermitWorkflowOverrides(permitId: string | undefined) {
  return useQuery({
    queryKey: ['permit-workflow-overrides', permitId],
    queryFn: async () => {
      if (!permitId) return [];

      const { data, error } = await supabase
        .from('permit_workflow_overrides')
        .select('*')
        .eq('permit_id', permitId);

      if (error) throw error;
      return data as PermitWorkflowOverride[];
    },
    enabled: !!permitId,
  });
}

// Hook to get overrides as a Map for easy lookup
export function usePermitWorkflowOverridesMap(permitId: string | undefined) {
  const { data: overrides, ...rest } = usePermitWorkflowOverrides(permitId);
  
  const overridesMap = new Map<string, boolean>();
  if (overrides) {
    for (const override of overrides) {
      overridesMap.set(override.workflow_step_id, override.is_required);
    }
  }
  
  return { data: overridesMap, ...rest };
}
