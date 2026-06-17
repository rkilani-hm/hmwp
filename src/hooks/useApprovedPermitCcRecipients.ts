import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CcRecipient {
  id: string;
  user_id: string;
  created_at: string;
  full_name: string | null;
  email: string | null;
}

const QUERY_KEY = ['wp-approval-cc-recipients'];

export function useApprovedPermitCcRecipients() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<CcRecipient[]> => {
      const { data: rows, error } = await supabase
        .from('wp_approval_cc_recipients' as any)
        .select('id, user_id, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const list = ((rows || []) as unknown) as Array<{ id: string; user_id: string; created_at: string }>;
      if (list.length === 0) return [];
      const ids = list.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      const map = new Map((profiles || []).map(p => [p.id, p]));
      return list.map(r => {
        const p = map.get(r.user_id);
        return {
          id: r.id,
          user_id: r.user_id,
          created_at: r.created_at,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
        };
      });
    },
  });
}

export function useAddCcRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('wp_approval_cc_recipients' as any)
        .insert({ user_id: userId, added_by: auth.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Recipient added');
    },
    onError: (e: any) => {
      if (e.code === '23505') toast.error('User is already a recipient');
      else toast.error('Failed to add recipient: ' + e.message);
    },
  });
}

export function useRemoveCcRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('wp_approval_cc_recipients' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Recipient removed');
    },
    onError: (e: any) => toast.error('Failed to remove recipient: ' + e.message),
  });
}
