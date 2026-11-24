import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AdhocApproval {
  id: string;
  permit_id: string;
  requested_by_user_id: string;
  requested_by_name: string | null;
  requested_by_role: string;
  target_user_id: string;
  target_name: string | null;
  target_role: string;
  target_role_label: string | null;
  status: 'pending' | 'approved' | 'rejected';
  request_note: string | null;
  comments: string | null;
  signature: string | null;
  auth_method: 'password' | 'webauthn' | null;
  approved_at: string | null;
  created_at: string;
}

export interface AdhocCandidate {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role_name: string;
  role_label: string;
}

export function usePermitAdhocApprovals(permitId?: string) {
  return useQuery({
    queryKey: ['permit-adhoc-approvals', permitId],
    enabled: !!permitId,
    queryFn: async (): Promise<AdhocApproval[]> => {
      const { data, error } = await supabase.rpc('get_permit_adhoc_approvals' as any, { p_permit_id: permitId });
      if (error) throw error;
      return (data ?? []) as AdhocApproval[];
    },
  });
}

export function useAdhocCandidates(permitId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['adhoc-candidates', permitId],
    enabled: !!permitId && enabled,
    queryFn: async (): Promise<AdhocCandidate[]> => {
      const { data, error } = await supabase.rpc('list_adhoc_approver_candidates' as any, { p_permit_id: permitId });
      if (error) throw error;
      return (data ?? []) as AdhocCandidate[];
    },
  });
}

/** Permit ids where the current user has a pending requested approval targeted at them. */
export function useMyPendingAdhocPermitIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-pending-adhoc', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await supabase
        .from('permit_adhoc_approvals' as any)
        .select('permit_id')
        .eq('target_user_id', user!.id)
        .eq('status', 'pending');
      return new Set(((data ?? []) as any[]).map((r) => r.permit_id));
    },
  });
}

export function useRequestAdditionalApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { permitId: string; permitNo: string; targetUserId: string; note: string }) => {
      const { data, error } = await supabase.rpc('request_additional_approval' as any, {
        p_permit_id: v.permitId, p_target_user_id: v.targetUserId, p_note: v.note || null,
      });
      if (error) throw new Error(error.message);
      // Best-effort push (the notification row itself is written server-side).
      supabase.functions.invoke('send-push-notification', {
        body: {
          userId: v.targetUserId,
          title: 'Approval requested',
          message: `You have been asked to approve ${v.permitNo}`,
          data: { url: `/permits/${v.permitId}`, permitId: v.permitId },
        },
      }).catch(() => {});
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['permit-adhoc-approvals', v.permitId] });
      qc.invalidateQueries({ queryKey: ['activity-logs', v.permitId] });
      toast.success('Approval requested. Your step is on hold until they respond.');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to request approval'),
  });
}
