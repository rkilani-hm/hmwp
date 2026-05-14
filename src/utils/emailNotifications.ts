import { supabase } from '@/integrations/supabase/client';

export type NotificationType = 
  | 'new_permit' 
  | 'approval_required' 
  | 'approved' 
  | 'rejected' 
  | 'rework' 
  | 'forwarded' 
  | 'closed' 
  | 'sla_warning' 
  | 'sla_breach'
  | 'resubmitted'
  | 'permit_submitted';

interface EmailDetails {
  permitId?: string;
  permitNo?: string;
  workType?: string;
  requesterName?: string;
  urgency?: string;
  approverName?: string;
  reason?: string;
  comments?: string;
  isInternal?: boolean;
  workDescription?: string;
  workLocation?: string;
  workDates?: string;
}

export async function sendEmailNotification(
  to: string[],
  notificationType: NotificationType,
  subject: string,
  details: EmailDetails
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-email-notification', {
      body: {
        to,
        notificationType,
        subject,
        permitNo: details.permitNo,
        permitId: details.permitId,
        details: {
          permitId: details.permitId,
          workType: details.workType,
          requesterName: details.requesterName,
          urgency: details.urgency,
          approverName: details.approverName,
          reason: details.reason,
          comments: details.comments,
        },
      },
    });

    if (error) {
      console.error('Email notification error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Email notification exception:', err);
    return { success: false, error: err.message };
  }
}

// Get emails for users with specific roles.
//
// Calls the get_emails_for_role server-side RPC, which:
//   - Reads user_roles + profiles via SECURITY DEFINER (bypasses RLS)
//   - Falls back to auth.users.email when profiles.email is empty
//   - Returns a deduplicated array
//
// The previous client-side query against profiles directly hit two
// problems:
//   1. RLS sometimes blocked reading other users' profile rows
//      (depending on caller's session and policy state)
//   2. profiles.email could be NULL/empty for users created via
//      service_role or pre-trigger paths — the filter(Boolean) would
//      silently drop them
//
// Both are solved by going through the RPC.
export async function getEmailsForRole(role: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc(
      'get_emails_for_role' as any,
      { p_role_name: role },
    );

    if (error) {
      console.error(
        `getEmailsForRole RPC failed for role "${role}":`,
        error,
      );
      // Fall back to the old direct-query path so callers don't break
      // on environments where the migration hasn't been applied yet.
      return await getEmailsForRoleFallback(role);
    }

    const payload = (data || {}) as {
      emails?: string[] | null;
      role_found?: boolean;
    };

    if (!payload.role_found) {
      console.warn(`getEmailsForRole: role "${role}" not found in roles table`);
      return [];
    }

    return payload.emails ?? [];
  } catch (err) {
    console.error(`getEmailsForRole exception for role "${role}":`, err);
    return await getEmailsForRoleFallback(role);
  }
}

// Legacy direct-query path. Kept as a fallback for environments
// where the get_emails_for_role RPC isn't yet deployed.
async function getEmailsForRoleFallback(role: string): Promise<string[]> {
  const { data: roleData } = await supabase
    .from('roles')
    .select('id')
    .eq('name', role)
    .single();

  if (!roleData) return [];

  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role_id', roleData.id);

  if (!userRoles || userRoles.length === 0) return [];

  const userIds = userRoles.map(ur => ur.user_id);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('email')
    .in('id', userIds);

  return profiles?.map(p => p.email).filter(Boolean) || [];
}

// Get next approver role based on current status
export function getNextApproverRole(currentStatus: string, workType: any): string | null {
  const approvalOrder = [
    { status: 'submitted', role: 'helpdesk', field: null },
    { status: 'pending_pm', role: 'pm', field: 'requires_pm' },
    { status: 'pending_pd', role: 'pd', field: 'requires_pd' },
    { status: 'pending_bdcr', role: 'bdcr', field: 'requires_bdcr' },
    { status: 'pending_mpr', role: 'mpr', field: 'requires_mpr' },
    { status: 'pending_it', role: 'it', field: 'requires_it' },
    { status: 'pending_fitout', role: 'fitout', field: 'requires_fitout' },
    { status: 'pending_ecovert_supervisor', role: 'ecovert_supervisor', field: 'requires_ecovert_supervisor' },
    { status: 'pending_pmd_coordinator', role: 'pmd_coordinator', field: 'requires_pmd_coordinator' },
  ];

  const currentIndex = approvalOrder.findIndex(a => a.status === currentStatus);
  if (currentIndex === -1) return null;

  // Find next required approval
  for (let i = currentIndex + 1; i < approvalOrder.length; i++) {
    const nextApproval = approvalOrder[i];
    if (!nextApproval.field || (workType && workType[nextApproval.field])) {
      return nextApproval.role;
    }
  }

  return null;
}
