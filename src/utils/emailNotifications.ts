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

// Get emails for users with specific roles
export async function getEmailsForRole(role: 'tenant' | 'helpdesk' | 'pm' | 'pd' | 'bdcr' | 'mpr' | 'it' | 'fitout' | 'ecovert_supervisor' | 'pmd_coordinator' | 'admin'): Promise<string[]> {
  // First get the role_id from the roles table
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
