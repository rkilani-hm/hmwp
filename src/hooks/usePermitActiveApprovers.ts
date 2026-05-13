import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the role(s) that are CURRENTLY expected to act on a single
 * permit. Reads from permit_active_approvers — the canonical source of
 * truth shared with the inbox query.
 *
 * Returns:
 *   - empty array if nothing is pending (permit fully approved, rejected,
 *     cancelled, archived, or in a terminal state)
 *   - one role for a serial workflow at this step
 *   - multiple roles for a parallel-approval workflow
 *
 * Used by:
 *   - PermitDetail's canApprove() to decide whether to show action
 *     buttons (replaces a hardcoded statusToRole map that didn't
 *     include custom roles like al_hamra_customer_service)
 *   - Inline "Currently with: X" display on permit cards / detail
 *     headers (so tenants and approvers always know who the ball is
 *     with right now)
 *
 * Read-only; respects RLS via the view's security_invoker setting.
 */
export interface PermitActiveApprover {
  role_id: string;
  role_name: string;
  workflow_step_id: string | null;
  step_order: number | null;
  sla_deadline: string | null;
}

export function usePermitActiveApprovers(permitId: string | undefined) {
  return useQuery({
    queryKey: ['permit-active-approvers', permitId],
    enabled: !!permitId,
    queryFn: async (): Promise<PermitActiveApprover[]> => {
      if (!permitId) return [];

      const { data, error } = await supabase
        .from('permit_active_approvers' as any)
        .select('role_id, role_name, workflow_step_id, step_order, sla_deadline')
        .eq('permit_id', permitId)
        .order('step_order', { ascending: true, nullsFirst: false });

      if (error) {
        // Non-fatal — caller will see empty array and treat as "no
        // current approver" (e.g. won't show action buttons). Better
        // UX than a crash.
        console.error('usePermitActiveApprovers query failed:', error);
        return [];
      }

      return (data ?? []) as unknown as PermitActiveApprover[];
    },
  });
}
