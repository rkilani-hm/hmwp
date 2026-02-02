import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PermitWorkflowAuditEntry {
  id: string;
  permit_id: string;
  modified_by: string;
  modified_by_name: string;
  modified_by_email: string;
  modification_type: 'work_type_change' | 'custom_flow';
  original_work_type_id: string | null;
  new_work_type_id: string | null;
  original_steps: any;
  new_steps: any;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function usePermitWorkflowAudit(permitId: string | undefined) {
  return useQuery({
    queryKey: ['permit-workflow-audit', permitId],
    queryFn: async () => {
      if (!permitId) return [];

      const { data, error } = await supabase
        .from('permit_workflow_audit')
        .select('*')
        .eq('permit_id', permitId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PermitWorkflowAuditEntry[];
    },
    enabled: !!permitId,
  });
}
