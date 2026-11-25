import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

// All recipient lookups and delivery happen server-side; the existing RPC
// authorizes the caller before inserting notifications or resolving addresses.
export async function notifyActiveApprovers(
  permitId: string,
  permitNo: string,
  _urgency: string,
  notificationType: 'new_permit' | 'resubmitted',
  _profile?: { full_name: string | null } | null,
  _userEmail?: string,
) {
  if (import.meta.env.VITE_DISABLE_NOTIFICATIONS === 'true') return;
  try {
    const { data, error } = await supabase.functions.invoke('dispatch-permit-notification', {
      body: { event: 'permit_pending', permitId, notificationType },
    });
    if (error) throw error;
    if (data?.deliveryWarnings) toast.warning(`Permit ${permitNo} submitted, but a notification could not be delivered.`);
  } catch (error) {
    console.error('[notify] server notification failed:', error);
    toast.warning(`Permit ${permitNo} saved, but approver notifications could not be sent.`);
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
