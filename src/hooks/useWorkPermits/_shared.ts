import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendEmailNotification } from '@/utils/emailNotifications';

export interface WorkPermit {
  id: string;
  permit_no: string;
  status: string;
  requester_id: string | null;
  requester_name: string;
  requester_email: string;
  contractor_name: string;
  unit: string;
  floor: string;
  contact_mobile: string;
  work_description: string;
  work_location: string;
  work_date_from: string;
  work_date_to: string;
  work_time_from: string;
  work_time_to: string;
  attachments: string[];
  work_type_id: string | null;

  // Urgency & SLA fields
  urgency: string | null;
  sla_deadline: string | null;
  sla_breached: boolean | null;

  // Rework tracking
  rework_version: number | null;
  rework_comments: string | null;

  // Workflow customization
  workflow_customized: boolean | null;
  workflow_modified_by: string | null;
  workflow_modified_at: string | null;

  // Approval fields
  helpdesk_status: string | null;
  helpdesk_approver_name: string | null;
  helpdesk_date: string | null;
  helpdesk_comments: string | null;
  helpdesk_signature: string | null;

  pm_status: string | null;
  pm_approver_name: string | null;
  pm_date: string | null;
  pm_comments: string | null;
  pm_signature: string | null;

  pd_status: string | null;
  pd_approver_name: string | null;
  pd_date: string | null;
  pd_comments: string | null;
  pd_signature: string | null;

  bdcr_status: string | null;
  mpr_status: string | null;
  it_status: string | null;
  fitout_status: string | null;
  ecovert_supervisor_status: string | null;
  pmd_coordinator_status: string | null;

  pdf_url: string | null;
  created_at: string;
  updated_at: string;

  // Joined data
  work_types?: {
    id: string;
    name: string;
    requires_pm: boolean;
    requires_pd: boolean;
    requires_bdcr: boolean;
    requires_mpr: boolean;
    requires_it: boolean;
    requires_fitout: boolean;
    requires_ecovert_supervisor: boolean;
    requires_pmd_coordinator: boolean;
  } | null;
}

export interface WorkType {
  id: string;
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor: boolean;
  requires_pmd_coordinator: boolean;
}

// Helper function to get the first workflow step for a work type
export async function getFirstWorkflowStep(workTypeId: string): Promise<{ roleName: string; status: string } | null> {
  try {
    // Fetch work type with template
    const { data: workType, error: workTypeError } = await supabase
      .from('work_types')
      .select('workflow_template_id')
      .eq('id', workTypeId)
      .single();

    if (workTypeError || !workType?.workflow_template_id) {
      return null;
    }

    // Fetch first workflow step with role
    const { data: steps, error: stepsError } = await supabase
      .from('workflow_steps')
      .select('*, roles:role_id(id, name, label)')
      .eq('workflow_template_id', workType.workflow_template_id)
      .order('step_order', { ascending: true })
      .limit(10);

    if (stepsError || !steps?.length) {
      return null;
    }

    // Fetch work type step configs to check which steps are required
    const { data: configs } = await supabase
      .from('work_type_step_config')
      .select('workflow_step_id, is_required')
      .eq('work_type_id', workTypeId);

    // Find the first required step
    for (const step of steps) {
      const role = step.roles as { id: string; name: string; label: string } | null;
      if (!role) continue;

      // Check if step is required
      const config = configs?.find(c => c.workflow_step_id === step.id);
      const isRequired = config !== undefined
        ? config.is_required
        : step.is_required_default ?? true;

      if (isRequired) {
        return {
          roleName: role.name,
          status: `pending_${role.name}`,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching first workflow step:', error);
    return null;
  }
}

// Helper: fan-out approver notifications via the server-side RPC.
//
// Why server-side instead of client-side queries?
// -----------------------------------------------------------------
// The original notifyRoleUsers ran in the CALLER's authenticated
// session. When that caller was a TENANT, three RLS policies blocked
// the lookups it needed:
//
//   - user_roles SELECT  : tenant can only see their own row
//   - profiles  SELECT  : tenant can only see their own profile
//   - notifications INSERT: WITH CHECK (true) — this part was fine
//
// So tenant-submitted permits silently fanned out to ZERO recipients.
// Admin-submitted permits worked because admin has broader SELECT
// access via the 'Admins can view all user_roles' / 'Admins can view
// all profiles' policies. This was the actual root cause of the
// long-running 'approvers don't see tenant-submitted permits' bug.
//
// The notify_permit_active_approvers RPC runs SECURITY DEFINER, so
// the user_roles + profiles reads bypass RLS. It also inserts the
// in-app notifications (idempotent) and returns the email + user_id
// lists so the frontend can hand them to the email + push edge
// functions, which are auth'd at the function level and don't have
// the same problem.
export async function notifyActiveApprovers(
  permitId: string,
  permitNo: string,
  urgency: string,
  notificationType: 'new_permit' | 'resubmitted',
  profile?: { full_name: string | null } | null,
  userEmail?: string,
) {
  try {
    const { data, error } = await supabase.rpc(
      'notify_permit_active_approvers' as any,
      {
        p_permit_id: permitId,
        p_notification_type: notificationType,
      },
    );

    if (error) {
      console.error(
        `[notify] RPC notify_permit_active_approvers failed for permit ${permitNo}:`,
        error,
      );
      // Surface a visible warning instead of silently no-op'ing.
      // Most common cause: the RPC migration not yet applied to the
      // database the frontend is talking to. If we hide this, the
      // user thinks 'permit submitted' was fully successful when in
      // fact no approver got pinged.
      const msg = (error as { message?: string }).message ?? String(error);
      if (/function.*does not exist|notify_permit_active_approvers/i.test(msg)) {
        toast.warning(
          'Permit submitted, but notifications could not be sent — the database is missing the notify_permit_active_approvers function. Ask your admin to apply pending migrations.',
          { duration: 10000 },
        );
      } else if (/permission denied/i.test(msg)) {
        console.warn(
          `[notify] RPC permission denied — caller is not requester/admin/approver of permit ${permitNo}. ` +
          `This is expected for some forward flows; ignore unless the requester is reporting missing notifications.`,
        );
      } else {
        toast.warning(
          `Permit submitted, but approver notification failed: ${msg}. Approvers will still see it in their inbox when they log in.`,
          { duration: 8000 },
        );
      }
      return;
    }

    // RPC returns a jsonb payload — shape documented in the migration.
    const payload = (data || {}) as {
      inserted_count?: number;
      user_ids?: string[];
      emails?: string[];
      active_roles?: string[];
      permit_no?: string;
      urgency?: string;
      requester_name?: string;
    };

    const userIds = payload.user_ids ?? [];
    const emails = payload.emails ?? [];
    const activeRoles = payload.active_roles ?? [];
    const skippedNoEmail = (payload as { skipped_no_email?: number }).skipped_no_email ?? 0;

    console.log(
      `[notify] permit=${permitNo} type=${notificationType} ` +
      `roles=[${activeRoles.join(', ')}] users=${userIds.length} ` +
      `emails=${emails.length} in_app_inserted=${payload.inserted_count ?? 0} ` +
      `skipped_no_email=${skippedNoEmail}`,
    );

    if (userIds.length === 0) {
      console.warn(
        `[notify] permit ${permitNo} has NO recipients. ` +
        `Either no active approver roles (workflow complete or ` +
        `misconfigured) or no users hold the role(s). Check ` +
        `/approver-audit to diagnose.`,
      );
      return;
    }

    // Surface a visible warning when users exist but none have email.
    // This is the exact failure mode of "approvers don't get email
    // even though dynamic assignment works".
    if (skippedNoEmail > 0) {
      console.warn(
        `[notify] permit ${permitNo}: ${skippedNoEmail} approver(s) ` +
        `had no email (neither profiles.email nor auth.users.email). ` +
        `Admin should run sync_profile_emails_from_auth() from ` +
        `/approver-audit.`,
      );
    }

    // Push notifications (best-effort; push not always configured).
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userIds,
          title:
            notificationType === 'new_permit'
              ? `New ${urgency === 'urgent' ? 'URGENT ' : ''}Permit`
              : 'Permit Resubmitted',
          message: `${permitNo} requires your review`,
          data: { url: '/inbox', permitId },
        },
      });
    } catch (pushError) {
      console.error('[notify] push failed:', pushError);
    }

    // Email notifications. The notify RPC now uses resolve_user_email
    // which falls back to auth.users.email when profiles.email is
    // empty — so emails.length is reliably > 0 whenever at least one
    // active approver has any email anywhere.
    //
    // Note: edge function `send-email-notification` uses notificationType
    // 'new_permit' (template exists). Resubmitted falls back to
    // 'new_permit' template since there's no separate 'resubmitted'
    // template in the edge function — the subject line distinguishes.
    if (emails.length > 0) {
      try {
        const emailType =
          notificationType === 'new_permit'
            ? 'new_permit'
            : ('new_permit' as const); // edge fn has no resubmitted template
        await sendEmailNotification(
          emails,
          emailType,
          notificationType === 'new_permit'
            ? `New ${urgency === 'urgent' ? 'URGENT ' : ''}Work Permit: ${permitNo}`
            : `Work Permit Resubmitted: ${permitNo}`,
          {
            permitId,
            permitNo,
            requesterName: profile?.full_name || userEmail || payload.requester_name,
            urgency,
          },
        );
        console.log(
          `[notify] email sent permit=${permitNo} recipients=${emails.length}`,
        );
      } catch (emailError) {
        console.error('[notify] email failed:', emailError);
      }
    } else {
      // userIds > 0 but emails === 0 — every user lacked an email.
      console.error(
        `[notify] permit ${permitNo}: ${userIds.length} user(s) ` +
        `assigned but ZERO emails could be resolved. Approvers will see ` +
        `the in-app notification but no email was sent. Run ` +
        `sync_profile_emails_from_auth() via /approver-audit.`,
      );
    }
  } catch (err) {
    console.error('[notify] unexpected error:', err);
  }
}

// Lightweight helper used by useForwardPermit. Reads the permit's
// urgency for the notification template. Tenant/approver session
// both have RLS access to work_permits.urgency (their own or
// approver-visible permits).
export async function fetchPermitUrgency(permitId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('work_permits')
      .select('urgency')
      .eq('id', permitId)
      .single();
    return (data?.urgency as string) || 'normal';
  } catch {
    return 'normal';
  }
}
