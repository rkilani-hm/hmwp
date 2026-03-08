import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeleteGatePass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (gatePassId: string) => {
      // Delete related items first
      await supabase
        .from('gate_pass_items')
        .delete()
        .eq('gate_pass_id', gatePassId);

      // Delete the gate pass
      const { error } = await supabase
        .from('gate_passes')
        .delete()
        .eq('id', gatePassId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Gate pass deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete gate pass: ' + error.message);
    },
  });
}
