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

export function useArchiveWorkPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permit: { id: string; permit_no: string; requester_name: string }) => {
      const { error } = await supabase
        .from('work_permits')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user?.id,
        } as any)
        .eq('id', permit.id);
      if (error) throw error;

      await logDeletionAction(
        'work_permit', permit.id, permit.permit_no,
        `Requester: ${permit.requester_name}`, 'archived',
        user?.id || '', profile?.full_name || '', user?.email || ''
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Work permit archived successfully');
    },
    onError: (e) => toast.error('Failed to archive: ' + e.message),
  });
}

export function useRestoreWorkPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permit: { id: string; permit_no: string; requester_name: string }) => {
      const { error } = await supabase
        .from('work_permits')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        } as any)
        .eq('id', permit.id);
      if (error) throw error;

      await logDeletionAction(
        'work_permit', permit.id, permit.permit_no,
        `Requester: ${permit.requester_name}`, 'restored',
        user?.id || '', profile?.full_name || '', user?.email || ''
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Work permit restored successfully');
    },
    onError: (e) => toast.error('Failed to restore: ' + e.message),
  });
}

export function useHardDeleteWorkPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permit: { id: string; permit_no: string; requester_name: string }) => {
      // Delete related data first
      await supabase.from('activity_logs').delete().eq('permit_id', permit.id);
      await supabase.from('permit_workflow_overrides').delete().eq('permit_id', permit.id);
      await supabase.from('signature_audit_logs').delete().eq('permit_id', permit.id);
      await supabase.from('permit_workflow_audit').delete().eq('permit_id', permit.id);
      await supabase.from('notifications').delete().eq('permit_id', permit.id);

      const { error } = await supabase.from('work_permits').delete().eq('id', permit.id);
      if (error) throw error;

      await logDeletionAction(
        'work_permit', permit.id, permit.permit_no,
        `Requester: ${permit.requester_name}`, 'permanently_deleted',
        user?.id || '', profile?.full_name || '', user?.email || ''
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Work permit permanently deleted');
    },
    onError: (e) => toast.error('Failed to delete: ' + e.message),
  });
}

export function useBulkArchiveWorkPermits() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permits: { id: string; permit_no: string; requester_name: string }[]) => {
      for (const permit of permits) {
        await supabase
          .from('work_permits')
          .update({
            is_archived: true,
            archived_at: new Date().toISOString(),
            archived_by: user?.id,
          } as any)
          .eq('id', permit.id);

        await logDeletionAction(
          'work_permit', permit.id, permit.permit_no,
          `Requester: ${permit.requester_name}`, 'archived',
          user?.id || '', profile?.full_name || '', user?.email || ''
        );
      }
    },
    onSuccess: (_, permits) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success(`${permits.length} work permit(s) archived`);
    },
    onError: (e) => toast.error('Bulk archive failed: ' + e.message),
  });
}

export function useBulkHardDeleteWorkPermits() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permits: { id: string; permit_no: string; requester_name: string }[]) => {
      for (const permit of permits) {
        await supabase.from('activity_logs').delete().eq('permit_id', permit.id);
        await supabase.from('permit_workflow_overrides').delete().eq('permit_id', permit.id);
        await supabase.from('signature_audit_logs').delete().eq('permit_id', permit.id);
        await supabase.from('permit_workflow_audit').delete().eq('permit_id', permit.id);
        await supabase.from('notifications').delete().eq('permit_id', permit.id);
        await supabase.from('work_permits').delete().eq('id', permit.id);

        await logDeletionAction(
          'work_permit', permit.id, permit.permit_no,
          `Requester: ${permit.requester_name}`, 'permanently_deleted',
          user?.id || '', profile?.full_name || '', user?.email || ''
        );
      }
    },
    onSuccess: (_, permits) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success(`${permits.length} work permit(s) permanently deleted`);
    },
    onError: (e) => toast.error('Bulk delete failed: ' + e.message),
  });
}
