import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ActivationRow {
  id: string;
  activated: boolean;
  last_sign_in_at: string | null;
  invitation_sent_at: string | null;
  invite_expired: boolean;
}

/**
 * Per-user account-activation status for admins: whether an invited user has
 * signed in yet (activated), and — if not — whether their invitation link has
 * expired (72h window). Backed by get_user_activation_status(), which reads
 * auth.users.last_sign_in_at. Admin-only.
 */
export function useUserActivation() {
  const { user, hasRole } = useAuth();
  return useQuery({
    queryKey: ['user-activation'],
    enabled: !!user && hasRole('admin'),
    queryFn: async (): Promise<Record<string, ActivationRow>> => {
      const { data, error } = await supabase.rpc('get_user_activation_status' as any);
      if (error) throw error;
      const map: Record<string, ActivationRow> = {};
      for (const r of (data ?? []) as ActivationRow[]) map[r.id] = r;
      return map;
    },
  });
}

/**
 * Resend a tenant's invitation: the invite-tenant function issues a fresh
 * recovery link (valid 24h) and re-emails it, then stamps invitation_sent_at.
 */
export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke('invite-tenant', {
        body: { email, resend: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Invitation resent — a fresh link (valid 24 hours) has been emailed.');
      qc.invalidateQueries({ queryKey: ['user-activation'] });
    },
    onError: (e: any) => toast.error('Failed to resend invitation: ' + (e?.message || 'unknown error')),
  });
}
