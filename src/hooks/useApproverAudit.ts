import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ApproverAuditRow {
  role_id: string;
  role_name: string;
  role_label: string | null;
  role_active: boolean;
  workflow_step_count: number;
  user_count: number;
  pending_permit_count: number;
  status: 'ok' | 'no_users' | 'no_workflow_steps' | 'orphaned_pending' | 'unused';
}

const AUDIT_KEY = ['approver-setup-audit'];

/**
 * Reads the approver_setup_audit diagnostic view. Surfaces the
 * configuration gaps that cause approvers to silently not see permits:
 *
 *   - orphaned_pending: pending permits waiting for a role that no
 *     user holds. CRITICAL — admin must assign the role to someone.
 *   - no_users: role appears in a workflow but no user holds it.
 *     Becomes orphaned_pending the moment a permit is routed through.
 *   - no_workflow_steps: users hold the role but no workflow uses
 *     it. Dormant; possibly stale.
 *   - unused: role exists with no workflow_steps and no users.
 *   - ok: configured correctly.
 *
 * Sorted by severity — orphaned_pending first.
 */
export function useApproverAudit() {
  return useQuery({
    queryKey: AUDIT_KEY,
    queryFn: async (): Promise<ApproverAuditRow[]> => {
      const { data, error } = await supabase
        .from('approver_setup_audit' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as ApproverAuditRow[];
    },
  });
}

/**
 * Calls notify_pending_approvers_backfill() RPC. Inserts in-app
 * notifications for every currently-pending approval that lacks one.
 * Idempotent — re-running inserts zero. Used as a catch-up when an
 * admin suspects notifications were missed (e.g. before this PR shipped).
 */
export function useNotifyPendingApproversBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc(
        'notify_pending_approvers_backfill' as any,
      );
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (inserted) => {
      if (inserted === 0) {
        toast.success('No missing notifications — every active approver already has one.');
      } else {
        toast.success(`Sent ${inserted} catch-up notification${inserted === 1 ? '' : 's'}.`);
      }
      qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to send catch-up notifications');
    },
  });
}
