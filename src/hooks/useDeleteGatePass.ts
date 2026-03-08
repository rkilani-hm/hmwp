import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

async function logDeletionAction(
  recordType: string,
  recordId: string,
  recordIdentifier: string,
  recordDetails: string,
  action: string,
  userId: string,
  userName: string,
  userEmail: string
) {
  await supabase.from('admin_deletion_logs').insert({
    record_type: recordType,
    record_id: recordId,
    record_identifier: recordIdentifier,
    record_details: recordDetails,
    action,
    performed_by: userId,
    performed_by_name: userName,
    performed_by_email: userEmail,
  } as any);
}

export function useArchiveGatePass() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (gp: { id: string; pass_no: string; requester_name: string }) => {
      const { error } = await supabase
        .from('gate_passes')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user?.id,
        } as any)
        .eq('id', gp.id);
      if (error) throw error;

      await logDeletionAction(
        'gate_pass', gp.id, gp.pass_no,
        `Requester: ${gp.requester_name}`, 'archived',
        user?.id || '', profile?.full_name || '', user?.email || ''
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Gate pass archived successfully');
    },
    onError: (e) => toast.error('Failed to archive: ' + e.message),
  });
}

export function useRestoreGatePass() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (gp: { id: string; pass_no: string; requester_name: string }) => {
      const { error } = await supabase
        .from('gate_passes')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        } as any)
        .eq('id', gp.id);
      if (error) throw error;

      await logDeletionAction(
        'gate_pass', gp.id, gp.pass_no,
        `Requester: ${gp.requester_name}`, 'restored',
        user?.id || '', profile?.full_name || '', user?.email || ''
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Gate pass restored successfully');
    },
    onError: (e) => toast.error('Failed to restore: ' + e.message),
  });
}

export function useHardDeleteGatePass() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (gp: { id: string; pass_no: string; requester_name: string }) => {
      await supabase.from('gate_pass_items').delete().eq('gate_pass_id', gp.id);
      const { error } = await supabase.from('gate_passes').delete().eq('id', gp.id);
      if (error) throw error;

      await logDeletionAction(
        'gate_pass', gp.id, gp.pass_no,
        `Requester: ${gp.requester_name}`, 'permanently_deleted',
        user?.id || '', profile?.full_name || '', user?.email || ''
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Gate pass permanently deleted');
    },
    onError: (e) => toast.error('Failed to delete: ' + e.message),
  });
}

export function useBulkArchiveGatePasses() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (passes: { id: string; pass_no: string; requester_name: string }[]) => {
      for (const gp of passes) {
        await supabase
          .from('gate_passes')
          .update({
            is_archived: true,
            archived_at: new Date().toISOString(),
            archived_by: user?.id,
          } as any)
          .eq('id', gp.id);

        await logDeletionAction(
          'gate_pass', gp.id, gp.pass_no,
          `Requester: ${gp.requester_name}`, 'archived',
          user?.id || '', profile?.full_name || '', user?.email || ''
        );
      }
    },
    onSuccess: (_, passes) => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success(`${passes.length} gate pass(es) archived`);
    },
    onError: (e) => toast.error('Bulk archive failed: ' + e.message),
  });
}

export function useBulkHardDeleteGatePasses() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (passes: { id: string; pass_no: string; requester_name: string }[]) => {
      for (const gp of passes) {
        await supabase.from('gate_pass_items').delete().eq('gate_pass_id', gp.id);
        await supabase.from('gate_passes').delete().eq('id', gp.id);

        await logDeletionAction(
          'gate_pass', gp.id, gp.pass_no,
          `Requester: ${gp.requester_name}`, 'permanently_deleted',
          user?.id || '', profile?.full_name || '', user?.email || ''
        );
      }
    },
    onSuccess: (_, passes) => {
      queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success(`${passes.length} gate pass(es) permanently deleted`);
    },
    onError: (e) => toast.error('Bulk delete failed: ' + e.message),
  });
}
