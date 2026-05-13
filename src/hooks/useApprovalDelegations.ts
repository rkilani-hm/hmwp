import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface ApprovalDelegation {
  id: string;
  delegator_id: string;
  delegate_id: string;
  role_id: string | null;
  valid_from: string;
  valid_to: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Joined display fields
  delegator_name?: string | null;
  delegator_email?: string | null;
  delegate_name?: string | null;
  delegate_email?: string | null;
  role_name?: string | null;
  role_label?: string | null;
}

export interface CreateDelegationInput {
  delegate_id: string;
  role_id: string | null; // null = all my roles
  valid_from: string;     // ISO timestamp
  valid_to: string;       // ISO timestamp
  reason?: string;
}

/**
 * All delegations involving the current user (either as delegator or
 * delegate). RLS already filters to "delegations involving me"; we
 * just fetch and split client-side.
 */
export function useMyDelegations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['approval-delegations', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<{
      asDelegator: ApprovalDelegation[];
      asDelegate: ApprovalDelegation[];
    }> => {
      if (!user) return { asDelegator: [], asDelegate: [] };

      // 1. Fetch all delegations (RLS limits to ones involving me)
      const { data: delegations, error } = await supabase
        .from('approval_delegations' as any)
        .select('*, roles:role_id(name, label)')
        .order('valid_from', { ascending: false });

      if (error) throw error;
      if (!delegations) return { asDelegator: [], asDelegate: [] };

      // 2. Hydrate delegator + delegate names from profiles. Use one
      //    round-trip for both columns by collecting unique user_ids.
      const userIds = new Set<string>();
      delegations.forEach((d: any) => {
        userIds.add(d.delegator_id);
        userIds.add(d.delegate_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(userIds));

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p]),
      );

      const enriched: ApprovalDelegation[] = delegations.map((d: any) => ({
        id: d.id,
        delegator_id: d.delegator_id,
        delegate_id: d.delegate_id,
        role_id: d.role_id,
        valid_from: d.valid_from,
        valid_to: d.valid_to,
        reason: d.reason,
        is_active: d.is_active,
        created_at: d.created_at,
        updated_at: d.updated_at,
        delegator_name: profileMap.get(d.delegator_id)?.full_name ?? null,
        delegator_email: profileMap.get(d.delegator_id)?.email ?? null,
        delegate_name: profileMap.get(d.delegate_id)?.full_name ?? null,
        delegate_email: profileMap.get(d.delegate_id)?.email ?? null,
        role_name: d.roles?.name ?? null,
        role_label: d.roles?.label ?? null,
      }));

      return {
        asDelegator: enriched.filter((d) => d.delegator_id === user.id),
        asDelegate: enriched.filter((d) => d.delegate_id === user.id),
      };
    },
  });
}

export function useCreateDelegation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateDelegationInput) => {
      if (!user) throw new Error('You must be signed in');

      if (input.delegate_id === user.id) {
        throw new Error('You cannot delegate to yourself');
      }

      // Sanity-check the time window
      const from = new Date(input.valid_from);
      const to = new Date(input.valid_to);
      if (to <= from) {
        throw new Error('"Valid to" must be after "Valid from"');
      }
      if (to <= new Date()) {
        throw new Error('"Valid to" is in the past — the delegation would have no effect');
      }

      const { data, error } = await supabase
        .from('approval_delegations' as any)
        .insert({
          delegator_id: user.id,
          delegate_id: input.delegate_id,
          role_id: input.role_id,
          valid_from: input.valid_from,
          valid_to: input.valid_to,
          reason: input.reason || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Delegation created');
      queryClient.invalidateQueries({ queryKey: ['approval-delegations'] });
      // The delegate's effective roles change immediately — invalidate
      // their inbox / role-gated queries too.
      queryClient.invalidateQueries({ queryKey: ['effective-roles'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create delegation');
    },
  });
}

export function useRevokeDelegation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (delegationId: string) => {
      const { error } = await supabase
        .from('approval_delegations' as any)
        .update({ is_active: false })
        .eq('id', delegationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Delegation revoked');
      queryClient.invalidateQueries({ queryKey: ['approval-delegations'] });
      queryClient.invalidateQueries({ queryKey: ['effective-roles'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to revoke delegation');
    },
  });
}
