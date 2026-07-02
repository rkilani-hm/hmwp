import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { sendEmailNotification } from '@/utils/emailNotifications';
import { notifyActiveApprovers, fetchPermitUrgency } from './_shared';

// Hook to forward permit to a different approver.
//
// All the work — status update, approval-row rewrite, activity log,
// authorization — is done by the forward_permit_to_role RPC server-
// side. The RPC is SECURITY DEFINER so it bypasses RLS on user_roles
// + profiles that previously blocked the client-side fan-out
// (approver sessions can only SELECT their own user_roles row, so the
// old code never found the target role's holders).
//
// After the forward succeeds, we call notifyActiveApprovers — which
// goes through notify_permit_active_approvers (also SECURITY DEFINER)
// — to ping the new target with in-app + push + email.
export function useForwardPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      targetRole,
      reason,
    }: {
      permitId: string;
      targetRole: string;
      reason: string;
    }) => {
      // Server-side RPC handles everything authoritative.
      const { data, error } = await supabase.rpc(
        'forward_permit_to_role' as any,
        {
          p_permit_id: permitId,
          p_target_role_name: targetRole,
          p_reason: reason || null,
        },
      );

      if (error) {
        const msg = (error as { message?: string }).message ?? String(error);
        if (/function.*does not exist|forward_permit_to_role/i.test(msg)) {
          throw new Error(
            'Cannot forward — the database is missing the forward_permit_to_role function. Ask your admin to apply pending migrations.',
          );
        }
        throw new Error(msg);
      }

      const payload = (data || {}) as {
        permit_no?: string;
        target_role?: string;
        target_role_label?: string | null;
        new_status?: string;
      };

      // After the RPC, the permit's permit_approvals row for the
      // target role is now pending. Fire the standard notification
      // RPC to ping the new target with in-app + push + email.
      // notifyActiveApprovers reads permit_active_approvers, which
      // now reflects the new target.
      await notifyActiveApprovers(
        permitId,
        payload.permit_no || permitId,
        // Forward doesn't carry urgency through the RPC; pull from
        // a quick lookup so the notification renders 4hr vs 48hr SLA
        // correctly.
        await fetchPermitUrgency(permitId),
        'new_permit',
        profile,
        user?.email,
      );

      return payload;
    },
    onSuccess: (_, variables) => {
      // Cache invalidations — forwarding changes work_permits.status
      // + permit_approvals rows + which step is "active". Same set
      // as useApprovePermit so inbox + sidebar + Currently-With badge
      // all refresh.
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      queryClient.invalidateQueries({ queryKey: ['permit-approvals', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-active-approvers', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['activity-logs', variables.permitId] });
      toast.success('Permit forwarded successfully');
    },
    onError: (error) => {
      toast.error('Failed to forward permit: ' + error.message);
    },
  });
}

// Forward the current step to a specific USER (not a role). The
// forward_permit_to_user RPC records a per-permit, per-step forward; the step's
// role is unchanged but the inbox/notify/gate route to the forwarded user only.
export function useForwardPermitToUser() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      userId,
      reason,
    }: {
      permitId: string;
      userId: string;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc('forward_permit_to_user' as any, {
        p_permit_id: permitId,
        p_user_id: userId,
        p_reason: reason || null,
      });

      if (error) {
        const msg = (error as { message?: string }).message ?? String(error);
        if (/function.*does not exist|forward_permit_to_user/i.test(msg)) {
          throw new Error(
            'Cannot forward — the database is missing the forward_permit_to_user function. Ask your admin to apply pending migrations.',
          );
        }
        throw new Error(msg);
      }

      const payload = (data || {}) as { permit_no?: string; forwarded_to_name?: string | null };

      // The step now routes to the forwarded user; notify_permit_active_approvers
      // reroutes the recipient to them.
      await notifyActiveApprovers(
        permitId,
        payload.permit_no || permitId,
        await fetchPermitUrgency(permitId),
        'new_permit',
        profile,
        user?.email,
      );

      return payload;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      queryClient.invalidateQueries({ queryKey: ['permit-approvals', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-active-approvers', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['activity-logs', variables.permitId] });
      toast.success('Permit forwarded successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to forward permit: ' + error.message);
    },
  });
}

// Hook to send permit back for rework
export function useRequestRework() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      reason,
    }: {
      permitId: string;
      reason: string;
    }) => {
      // Set status to rework_needed and store the comments
      const { data, error } = await supabase
        .from('work_permits')
        .update({
          status: 'rework_needed' as any,
          rework_comments: reason,
          // Reset all approval statuses so workflow starts fresh after resubmit
          helpdesk_status: 'pending',
          helpdesk_approver_name: null,
          helpdesk_approver_email: null,
          helpdesk_comments: null,
          helpdesk_signature: null,
          helpdesk_date: null,
          pm_status: 'pending',
          pm_approver_name: null,
          pm_approver_email: null,
          pm_comments: null,
          pm_signature: null,
          pm_date: null,
          pd_status: 'pending',
          pd_approver_name: null,
          pd_approver_email: null,
          pd_comments: null,
          pd_signature: null,
          pd_date: null,
          bdcr_status: 'pending',
          bdcr_approver_name: null,
          bdcr_approver_email: null,
          bdcr_comments: null,
          bdcr_signature: null,
          bdcr_date: null,
          mpr_status: 'pending',
          mpr_approver_name: null,
          mpr_approver_email: null,
          mpr_comments: null,
          mpr_signature: null,
          mpr_date: null,
          it_status: 'pending',
          it_approver_name: null,
          it_approver_email: null,
          it_comments: null,
          it_signature: null,
          it_date: null,
          fitout_status: 'pending',
          fitout_approver_name: null,
          fitout_approver_email: null,
          fitout_comments: null,
          fitout_signature: null,
          fitout_date: null,
          ecovert_supervisor_status: 'pending',
          ecovert_supervisor_approver_name: null,
          ecovert_supervisor_approver_email: null,
          ecovert_supervisor_comments: null,
          ecovert_supervisor_signature: null,
          ecovert_supervisor_date: null,
          pmd_coordinator_status: 'pending',
          pmd_coordinator_approver_name: null,
          pmd_coordinator_approver_email: null,
          pmd_coordinator_comments: null,
          pmd_coordinator_signature: null,
          pmd_coordinator_date: null,
        })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Rework Requested',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: reason,
      });

      // Notify the requester
      if (data.requester_id) {
        await supabase.from('notifications').insert({
          user_id: data.requester_id,
          permit_id: permitId,
          type: 'rework_requested',
          title: 'Rework Requested',
          message: `Your permit ${data.permit_no} requires changes. Reason: ${reason}`,
        });
      }

      // Send email notification to requester
      try {
        if (data.requester_email) {
          await sendEmailNotification(
            [data.requester_email],
            'rework',
            `Work Permit Rework Required: ${data.permit_no}`,
            {
              permitId,
              permitNo: data.permit_no,
              comments: reason,
            }
          );
        }
      } catch (emailError) {
        console.error('Failed to send rework email notification:', emailError);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit sent back for rework');
    },
    onError: (error) => {
      toast.error('Failed to request rework: ' + error.message);
    },
  });
}

// Hook to cancel a permit (only by creator)
export function useCancelPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      reason,
    }: {
      permitId: string;
      reason: string;
    }) => {
      // First verify the user is the creator
      const { data: permit } = await supabase
        .from('work_permits')
        .select('requester_id, permit_no')
        .eq('id', permitId)
        .single();

      if (!permit) throw new Error('Permit not found');
      if (permit.requester_id !== user?.id) {
        throw new Error('You can only withdraw permits you created');
      }

      // Withdrawal-specific UPDATE: doesn't chain .select().single()
      // because that's what produced the misleading 'Cannot coerce the
      // result to a single JSON object' error when RLS blocked the
      // post-update SELECT. Instead we ask for a minimal { count }
      // response which tells us straight away whether the UPDATE took
      // effect. If 0 rows matched, RLS is blocking us — surface a
      // friendly message instead of a Postgrest internal.
      const { error, count } = await supabase
        .from('work_permits')
        .update({ status: 'cancelled' }, { count: 'exact' })
        .eq('id', permitId)
        .eq('requester_id', user?.id); // Extra safety check

      if (error) throw error;

      if (count === 0) {
        // Most likely RLS — the 'Users can withdraw own non-terminal
        // permits' policy added in migration 20260513240000 should
        // allow this. If we hit this branch:
        //   - migration hasn't been applied yet → admin needs to run it
        //   - permit is in a terminal state (approved / rejected /
        //     cancelled / closed) → withdraw isn't allowed there
        throw new Error(
          'You cannot withdraw this permit. It may already be in a final state (approved, rejected, or closed), ' +
          'or your admin needs to apply the latest migration. Refresh the page and try again.'
        );
      }

      // Log activity. Verb is "Withdrawn" to match the tenant-facing
      // UI ("Withdraw permit"). The DB status itself is still
      // 'cancelled' (legacy enum value); the activity_logs label is
      // the human-readable verb so reports/audit show this as a
      // withdrawal, not a cancellation.
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Withdrawn',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: reason || 'Withdrawn by requester',
      });

      // Notify approvers that the permit was withdrawn
      const { data: helpdeskRoleData } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'helpdesk')
        .single();

      const { data: helpdeskUsers } = helpdeskRoleData ? await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_id', helpdeskRoleData.id) : { data: null };

      if (helpdeskUsers) {
        for (const hd of helpdeskUsers) {
          await supabase.from('notifications').insert({
            user_id: hd.user_id,
            permit_id: permitId,
            type: 'cancelled',
            title: 'Permit Withdrawn',
            message: `Permit ${permit.permit_no} has been withdrawn by the requester.`,
          });
        }
      }

      // No payload to return — onSuccess just invalidates caches.
      return;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit withdrawn successfully');
    },
    onError: (error) => {
      toast.error('Failed to withdraw permit: ' + error.message);
    },
  });
}
