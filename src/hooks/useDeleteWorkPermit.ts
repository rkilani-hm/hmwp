import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeleteWorkPermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (permitId: string) => {
      // Delete related activity logs first
      await supabase
        .from('activity_logs')
        .delete()
        .eq('permit_id', permitId);

      // Delete permit workflow overrides
      await supabase
        .from('permit_workflow_overrides')
        .delete()
        .eq('permit_id', permitId);

      // Delete signature audit logs
      await supabase
        .from('signature_audit_logs')
        .delete()
        .eq('permit_id', permitId);

      // Delete permit workflow audit
      await supabase
        .from('permit_workflow_audit')
        .delete()
        .eq('permit_id', permitId);

      // Delete notifications referencing this permit
      await supabase
        .from('notifications')
        .delete()
        .eq('permit_id', permitId);

      // Delete the permit itself
      const { error } = await supabase
        .from('work_permits')
        .delete()
        .eq('id', permitId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Work permit deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete work permit: ' + error.message);
    },
  });
}
