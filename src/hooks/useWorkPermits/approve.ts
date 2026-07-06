import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseEdgeFunctionError } from '@/utils/edgeFunctionErrors';
import { approveVerb } from '@/utils/actorVerb';
import { notifyActiveApprovers } from './_shared';

export function useApprovePermit() {
  const queryClient = useQueryClient();
  const { user, profile, roles } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      role,
      comments,
      signature,
      approved,
    }: {
      permitId: string;
      role: string;
      comments: string;
      signature: string | null;
      approved: boolean;
    }) => {
      const roleField = role.toLowerCase().replace(' ', '_');
      const approvalStatus = approved ? 'approved' : 'rejected';

      // Build update object dynamically
      const updateData: Record<string, unknown> = {
        [`${roleField}_status`]: approvalStatus,
        [`${roleField}_approver_name`]: profile?.full_name || user?.email,
        [`${roleField}_approver_email`]: user?.email,
        [`${roleField}_date`]: new Date().toISOString(),
        [`${roleField}_comments`]: comments,
        [`${roleField}_signature`]: signature,
      };

      // Update status based on approval flow
      if (!approved) {
        updateData.status = 'rejected';
      }

      const { data, error } = await supabase
        .from('work_permits')
        .update(updateData)
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Detect if this approval is being made via delegation. If so,
      // annotate the audit log so reviewers can later see that the
      // approval came from a deputy, not the role's named approver.
      // get_delegation_origin returns the delegator's user_id when
      // the current user is acting via an active delegation for
      // this role, or NULL when acting in their own right.
      let delegationNote = '';
      try {
        const { data: originId } = await supabase.rpc(
          'get_delegation_origin' as any,
          { acting_user_id: user?.id, acting_role_name: roleField },
        );
        if (originId) {
          const { data: origin } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', originId)
            .single();
          const originName = origin?.full_name || origin?.email || 'unknown';
          delegationNote = ` (acting on behalf of ${originName} via delegation)`;
        }
      } catch (delegationErr) {
        // get_delegation_origin may not exist on older deployments;
        // skip the annotation rather than fail the approval.
        console.warn('Delegation lookup failed (non-fatal):', delegationErr);
      }

      // Log activity. Approve verb derives from the acting user's
      // actor_type (spec R5) — cosmetic only; stored status is unchanged.
      // Defaults to "Approved" when actor_type is missing (fail safe).
      const approvedVerb = profile?.actor_type === 'reviewer' ? 'Reviewed' : 'Approved';
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action:
          (approved ? `${role} ${approvedVerb}` : `${role} Rejected`) +
          delegationNote,
        performed_by: (profile?.full_name || user?.email || 'Unknown') + delegationNote,
        performed_by_id: user?.id,
        details: comments || undefined,
      });

      // Notify the NEXT stage's approvers (only on approve — rejection
      // ends the workflow, no one else needs to act).
      //
      // This was missing before — useApprovePermit advanced the permit
      // through the workflow but never told the next role anyone was
      // waiting on them. Result: approvers past stage 1 didn't get
      // emailed/pushed and only saw the permit if they happened to
      // open their inbox.
      //
      // Reads from permit_active_approvers, which now reflects the
      // post-approval state (the approver-advancement trigger on
      // permit_approvals updates the view between our UPDATE and this
      // query). Same source as the inbox, so consistent.
      if (approved) {
        try {
          // Need permit_no for the notification body
          const { data: permitInfo } = await supabase
            .from('work_permits')
            .select('permit_no, urgency')
            .eq('id', permitId)
            .single();

          if (permitInfo) {
            await notifyActiveApprovers(
              permitId,
              permitInfo.permit_no,
              permitInfo.urgency || 'normal',
              'new_permit',
              profile,
              user?.email,
            );
          }
        } catch (notifyErr) {
          // Non-fatal — the approval already succeeded. Log so it
          // surfaces in monitoring; don't roll back.
          console.error(
            `[notify] Failed to notify next-stage approvers after ${role} approved permit ${permitId}:`,
            notifyErr,
          );
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      // Comprehensive cache invalidation: the action changed permit
      // status + permit_approvals rows + which step is "active".
      // Anything reading these caches needs to refetch.
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      // Inbox query — without this the just-actioned permit lingers
      // in the approver's inbox until manual refresh.
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      // Approval progress sidebar reads permit_approvals — refresh so
      // it shows the new approved/rejected mark immediately.
      queryClient.invalidateQueries({ queryKey: ['permit-approvals', variables.permitId] });
      // "Currently with" inline badge depends on permit_active_approvers
      // for this permit; the next-stage role just became active.
      queryClient.invalidateQueries({ queryKey: ['permit-active-approvers', variables.permitId] });
      // Activity log will have a new row.
      queryClient.invalidateQueries({ queryKey: ['activity-logs', variables.permitId] });
      toast.success(variables.approved ? 'Permit approved!' : 'Permit rejected');
    },
    onError: (error) => {
      toast.error('Failed to process approval: ' + error.message);
    },
  });
}

// User-friendly error parsing is now handled by '@/utils/edgeFunctionErrors'

export type ApprovalAuth =
  | { authMethod: 'password'; password: string }
  | {
      authMethod: 'webauthn';
      webauthn: { challengeId: string; assertion: unknown };
    };

export function useSecureApprovePermit() {
  const queryClient = useQueryClient();
  // Current user's actor_type drives the displayed approve verb in the
  // success toast (Approve/Approved vs Review/Reviewed) — cosmetic only.
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      role,
      comments,
      signature,
      approved,
      auth,
      scheduleOverride,
    }: {
      permitId: string;
      role: string;
      comments: string;
      signature: string | null;
      approved: boolean;
      auth: ApprovalAuth;
      // When an approver adjusts the work window while approving, the new
      // schedule is sent here. The edge function applies it and logs the
      // change (old → new) under the approver's name.
      scheduleOverride?: {
        workDateFrom: string;
        workDateTo: string;
        workTimeFrom: string;
        workTimeTo: string;
      };
    }) => {
      const body: Record<string, unknown> = {
        permitId,
        role,
        comments,
        signature,
        approved,
        authMethod: auth.authMethod,
      };
      if (scheduleOverride) {
        body.scheduleOverride = scheduleOverride;
      }
      if (auth.authMethod === 'password') {
        body.password = auth.password;
      } else {
        body.webauthn = auth.webauthn;
      }

      const { data, error } = await supabase.functions.invoke(
        'verify-signature-approval',
        { body },
      );

      if (error) {
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        console.error('Edge function error:', error, 'Data:', data);
        throw new Error(userFriendlyMessage);
      }
      if (data?.error) {
        const userFriendlyMessage = parseEdgeFunctionError({ message: data.error }, data);
        throw new Error(userFriendlyMessage);
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      // See sibling useApprovePermit for the full list rationale —
      // both code paths must keep cache state consistent or stale
      // rows linger in the inbox + progress sidebar after action.
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      queryClient.invalidateQueries({ queryKey: ['permit-approvals', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-active-approvers', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['activity-logs', variables.permitId] });
      toast.success(
        variables.approved
          ? `Permit ${approveVerb(profile?.actor_type, 'past').toLowerCase()} with verified signature!`
          : 'Permit rejected',
      );
    },
    onError: (error: Error) => {
      const message = error.message || 'Failed to process approval';
      if (
        !message.toLowerCase().includes('password') &&
        !message.toLowerCase().includes('incorrect')
      ) {
        toast.error(message);
      }
    },
  });
}
