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
  // Legacy rework caller: recipient/subject/details are never forwarded.
  // The server verifies the recorded rework action and derives the email.
  if (notificationType !== 'rework' || !details.permitId) {
    return { success: false, error: 'Use a verified server notification action' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('dispatch-permit-notification', {
      body: { event: 'rework', permitId: details.permitId },
    });
    if (error) return { success: false, error: error.message };
    return { success: !data?.deliveryWarnings };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Notification failed' };
  }
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
