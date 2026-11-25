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
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
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
        .eq('target_user_id', user?.id ?? '')
        .eq('status', 'pending');
      return new Set(((data ?? []) as any[]).map((r) => r.permit_id));
    },
  });
}

export function useRequestAdditionalApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { permitId: string; permitNo: string; targetUserId: string; targetEmail?: string | null; requesterName?: string | null; note: string }) => {
      const { data, error } = await supabase.functions.invoke('dispatch-permit-notification', {
        body: { event: 'adhoc_request', permitId: v.permitId, targetUserId: v.targetUserId, note: v.note || '' },
      });
      if (error) throw new Error(error.message);
      if (data?.deliveryWarnings) toast.warning('Approval requested, but a notification could not be delivered.');
      return data?.result;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['permit-adhoc-approvals', v.permitId] });
      qc.invalidateQueries({ queryKey: ['activity-logs', v.permitId] });
      toast.success('Approval requested. Your step is on hold until they respond.');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to request approval'),
  });
}

export function useCancelAdditionalApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { adhocId: string; permitId: string; permitNo: string; targetUserId: string }) => {
      const { data, error } = await supabase.functions.invoke('dispatch-permit-notification', {
        body: { event: 'adhoc_cancel', adhocId: v.adhocId },
      });
      if (error) throw new Error(error.message);
      if (data?.deliveryWarnings) toast.warning('Request withdrawn, but its notification could not be delivered.');
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['permit-adhoc-approvals', v.permitId] });
      qc.invalidateQueries({ queryKey: ['activity-logs', v.permitId] });
      qc.invalidateQueries({ queryKey: ['my-pending-adhoc'] });
      toast.success('Request withdrawn. You can now decide your step.');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to cancel request'),
  });
}
