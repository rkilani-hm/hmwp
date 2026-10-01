import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the role the CURRENT user is authorised to act AS on this permit's
 * current step — resolved server-side by `get_my_action_role`, which honours
 * direct role holders, admins, active delegations AND per-permit forwards
 * (permit_step_forwards). Returns null when the user may not act.
 *
 * This is the forward/delegation-aware counterpart to usePermitActiveApprovers
 * (which only lists the step's ROLES, not who may act). PermitDetail uses it so
 * a forwarded user — who does NOT hold the step's role — still sees the approve
 * button and submits under the correct role, matching the edge function's own
 * authorize_permit_approval gate.
 */
export function usePermitActionRole(permitId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['permit-action-role', permitId, user?.id],
    enabled: !!permitId && !!user,
    queryFn: async (): Promise<string | null> => {
      if (!permitId) return null;
      const { data, error } = await (supabase as any).rpc('get_my_action_role', {
        p_permit_id: permitId,
      });
      if (error) {
        console.error('get_my_action_role failed:', error);
        return null;
      }
      return (data as string | null) ?? null;
    },
  });
}
