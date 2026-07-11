import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PermitAmendment {
  id: string;
  permit_id: string;
  amendment_type: 'extend' | 'add_ids';
  reason: string | null;
  old_date_to: string | null;
  old_time_to: string | null;
  new_date_to: string | null;
  new_time_to: string | null;
  added_id_count: number | null;
  requested_by_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_comment: string | null;
  created_at: string;
}

const db = supabase as unknown as { from: (t: string) => any };

export function useCanApproveAmendment() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['can-approve-amendment', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase.rpc('can_approve_amendment' as any, { p_user: user!.id });
      return !!data;
    },
  });
}

// Amendments for one permit (owner + staff).
export function usePermitAmendments(permitId: string | null) {
  return useQuery({
    queryKey: ['permit-amendments', permitId],
    enabled: !!permitId,
    queryFn: async (): Promise<PermitAmendment[]> => {
      const { data, error } = await db.from('permit_amendments').select('*')
        .eq('permit_id', permitId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PermitAmendment[];
    },
  });
}

// Pending amendments across all permits (approver queue) — joined with permit no.
export function usePendingAmendments() {
  return useQuery({
    queryKey: ['pending-amendments'],
    queryFn: async () => {
      const { data, error } = await db.from('permit_amendments')
        .select('*, work_permits(permit_no, requester_name, work_date_from, work_date_to)')
        .eq('status', 'pending').order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as (PermitAmendment & { work_permits: any })[];
    },
  });
}

export function useRequestAmendment() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      permitId: string;
      type: 'extend' | 'add_ids';
      reason?: string;
      // extend
      oldDateTo?: string; oldTimeTo?: string; newDateTo?: string; newTimeTo?: string;
      // add_ids
      files?: File[];
    }) => {
      let addedCount: number | null = null;
      if (input.type === 'add_ids' && input.files?.length) {
        // Upload each new Civil ID and attach it to the permit.
        for (const file of input.files) {
          const safe = file.name.replace(/[^\w.\-]/g, '_');
          const path = `${user!.id}/${input.permitId}/amend-${Date.now()}-${safe}`;
          const { error: upErr } = await supabase.storage.from('permit-attachments').upload(path, file);
          if (upErr) throw upErr;
          await db.from('permit_attachments').insert({
            permit_id: input.permitId, file_path: path, file_name: file.name,
            mime_type: file.type || null, file_size: file.size, document_type: 'civil_id',
            uploaded_by: user!.id,
          });
        }
        addedCount = input.files.length;
      }
      const { error } = await db.from('permit_amendments').insert({
        permit_id: input.permitId,
        amendment_type: input.type,
        reason: input.reason || null,
        old_date_to: input.oldDateTo || null,
        old_time_to: input.oldTimeTo || null,
        new_date_to: input.type === 'extend' ? (input.newDateTo || null) : null,
        new_time_to: input.type === 'extend' ? (input.newTimeTo || null) : null,
        added_id_count: addedCount,
        requested_by: user!.id,
        requested_by_name: profile?.full_name || user?.email || 'Unknown',
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['permit-amendments', v.permitId] });
      qc.invalidateQueries({ queryKey: ['pending-amendments'] });
      toast.success('Amendment request submitted for Health & Safety approval');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit amendment'),
  });
}

export function useResolveAmendment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amendmentId: string; approve: boolean; comment?: string }) => {
      const { data, error } = await supabase.functions.invoke('resolve-permit-amendment', {
        body: { amendmentId: input.amendmentId, approve: input.approve, comment: input.comment },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['pending-amendments'] });
      qc.invalidateQueries({ queryKey: ['permit-amendments'] });
      toast.success(v.approve ? 'Amendment approved' : 'Amendment rejected');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to resolve amendment'),
  });
}
