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
      return ((data ?? []) as unknown) as ApproverAuditRow[];
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

export interface ReassignmentResult {
  permit_id: string;
  permit_no: string | null;
  skipped_count: number;
  inserted_count: number;
  active_roles: string[] | null;
  old_status: string;
  new_status: string;
  status_changed: boolean;
  error?: string;
}

export interface BulkReassignmentSummary {
  processed_count: number;
  changed_count: number;
  results: ReassignmentResult[];
}

/**
 * Calls reassign_all_active_permits() RPC. For every non-terminal
 * permit, reconciles its permit_approvals rows against the CURRENT
 * workflow configuration. Used when admin has updated workflows and
 * wants existing permits to pick up the new structure (instead of
 * being stuck waiting for roles that no longer exist).
 *
 * The reconciliation is idempotent and safe to re-run.
 *
 * After reconciliation, for every permit where a NEW active role
 * appeared (skipped_count > 0 OR inserted_count > 0), fires the
 * notify_permit_active_approvers RPC. That RPC inserts in-app
 * notifications AND returns the email list. We then call
 * send-email-notification so the newly-assigned approvers get
 * email pings too.
 *
 * Admin only.
 */
export function useReassignAllPermits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BulkReassignmentSummary> => {
      const { data, error } = await supabase.rpc(
        'reassign_all_active_permits' as any,
      );
      if (error) throw error;
      const summary = (data as unknown) as BulkReassignmentSummary;

      // For every permit where the active approver set changed, fire
      // the notification RPC. Best-effort; failures don't roll back
      // the reassignment.
      const needsNotify = (summary.results ?? []).filter(
        (r) =>
          !r.error &&
          ((r.skipped_count ?? 0) > 0 ||
           (r.inserted_count ?? 0) > 0 ||
           r.status_changed) &&
          Array.isArray(r.active_roles) &&
          r.active_roles.length > 0,
      );

      for (const r of needsNotify) {
        try {
          const { data: notifyResult, error: notifyErr } = await supabase.rpc(
            'notify_permit_active_approvers' as any,
            {
              p_permit_id: r.permit_id,
              p_notification_type: 'new_permit',
            },
          );
          if (notifyErr) {
            console.warn(`notify failed for ${r.permit_no}:`, notifyErr);
            continue;
          }
          const payload = (notifyResult || {}) as {
            emails?: string[] | null;
            permit_no?: string;
            urgency?: string;
            requester_name?: string;
          };
          const emails = payload.emails ?? [];
          if (emails.length > 0) {
            // Reuse the existing edge function which has SMTP creds.
            // Field names match EmailRequest interface in
            // supabase/functions/send-email-notification: notificationType
            // (not 'type') and details (not 'data'). Also pass permitId
            // and permitNo at top level — the function reads them there
            // for activity logging and rate-limiting.
            await supabase.functions.invoke('send-email-notification', {
              body: {
                to: emails,
                subject: `Work Permit Awaiting Your Review: ${payload.permit_no || r.permit_no || ''}`,
                notificationType: 'new_permit',
                permitId: r.permit_id,
                permitNo: payload.permit_no || r.permit_no || '',
                details: {
                  permitId: r.permit_id,
                  permitNo: payload.permit_no || r.permit_no || '',
                  urgency: payload.urgency || 'normal',
                  requesterName: payload.requester_name,
                },
              },
            });
          }
        } catch (err) {
          console.warn(`notify chain failed for ${r.permit_no}:`, err);
        }
      }

      return summary;
    },
    onSuccess: (summary) => {
      if (summary.changed_count === 0) {
        toast.success(
          `Checked ${summary.processed_count} permit${summary.processed_count === 1 ? '' : 's'} — all already aligned with current workflow.`,
        );
      } else {
        toast.success(
          `Reconciled ${summary.changed_count} of ${summary.processed_count} permit${summary.processed_count === 1 ? '' : 's'} against the current workflow. Newly-assigned approvers have been notified.`,
        );
      }
      qc.invalidateQueries({ queryKey: AUDIT_KEY });
      qc.invalidateQueries({ queryKey: ['work-permits'] });
      qc.invalidateQueries({ queryKey: ['pending-permits-approver'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to reassign permits');
    },
  });
}

/**
 * Calls sync_profile_emails_from_auth() RPC. For every public.profiles
 * row whose email is NULL/empty, copies it from auth.users.email.
 * Also creates missing profile rows for any auth.users with none.
 *
 * Use case: approvers report "I see permits in my inbox but never get
 * email" -> their profiles.email is empty -> notify_permit_active_approvers
 * silently skips them. One click fixes the entire backlog.
 *
 * Idempotent; safe to re-run.
 *
 * Admin only.
 */
export function useSyncProfileEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ updated_count: number; inserted_count: number }> => {
      const { data, error } = await supabase.rpc(
        'sync_profile_emails_from_auth' as any,
      );
      if (error) throw error;
      return (data as unknown) as { updated_count: number; inserted_count: number };
    },
    onSuccess: (result) => {
      const { updated_count: u, inserted_count: i } = result;
      if (u === 0 && i === 0) {
        toast.success('All profile emails are already in sync with auth.users.');
      } else {
        const parts: string[] = [];
        if (u > 0) parts.push(`${u} profile email${u === 1 ? '' : 's'} backfilled`);
        if (i > 0) parts.push(`${i} missing profile row${i === 1 ? '' : 's'} created`);
        toast.success(parts.join(', ') + '. Approvers will now receive email notifications.');
      }
      qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to sync profile emails');
    },
  });
}
