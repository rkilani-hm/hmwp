import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendEmailNotification, getEmailsForRole } from '@/utils/emailNotifications';

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

export interface WorkLocation {
  id: string;
  name: string;
  description: string | null;
  location_type: 'shop' | 'common';
  is_active: boolean;
}

// Public hook to fetch work types (no auth required)
export function usePublicWorkTypes() {
  return useQuery({
    queryKey: ['public-work-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as WorkType[];
    },
  });
}

// Public hook to fetch work locations (no auth required)
export function usePublicWorkLocations() {
  return useQuery({
    queryKey: ['public-work-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_locations')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as WorkLocation[];
    },
  });
}

// Public hook to create internal permits (no auth required)
export function useCreatePublicPermit() {
  return useMutation({
    mutationFn: async (permitData: {
      external_company_name: string;
      external_contact_person: string;
      contact_mobile: string;
      requester_email: string;
      unit: string;
      floor: string;
      work_location: string;
      work_location_id?: string | null;
      work_location_other?: string | null;
      work_type_id: string;
      work_description: string;
      work_date_from: string;
      work_date_to: string;
      work_time_from: string;
      work_time_to: string;
      urgency?: 'normal' | 'urgent';
    }) => {
      // Generate permit number with INT prefix for internal permits
      const permitNo = `INT-${Date.now().toString(36).toUpperCase()}`;
      
      // Calculate SLA deadline based on urgency
      const urgency = permitData.urgency || 'normal';
      const hoursToAdd = urgency === 'urgent' ? 4 : 48;
      const slaDeadline = new Date(Date.now() + hoursToAdd * 60 * 60 * 1000).toISOString();

      // Create the permit with is_internal flag
      const { data, error } = await supabase
        .from('work_permits')
        .insert({
          permit_no: permitNo,
          requester_id: null, // No authenticated user
          requester_name: permitData.external_contact_person,
          requester_email: permitData.requester_email,
          contractor_name: permitData.external_company_name,
          external_company_name: permitData.external_company_name,
          external_contact_person: permitData.external_contact_person,
          contact_mobile: permitData.contact_mobile,
          unit: permitData.unit,
          floor: permitData.floor,
          work_location: permitData.work_location,
          work_location_id: permitData.work_location_id || null,
          work_location_other: permitData.work_location_other || null,
          work_type_id: permitData.work_type_id,
          work_description: permitData.work_description,
          work_date_from: permitData.work_date_from,
          work_date_to: permitData.work_date_to,
          work_time_from: permitData.work_time_from,
          work_time_to: permitData.work_time_to,
          status: 'submitted',
          urgency,
          sla_deadline: slaDeadline,
          is_internal: true, // Mark as internal permit
        })
        .select()
        .single();

      if (error) throw error;

      // Send email notification to helpdesk about new internal permit
      try {
        const helpdeskEmails = await getEmailsForRole('helpdesk');
        if (helpdeskEmails.length > 0) {
          await sendEmailNotification(
            helpdeskEmails,
            'new_permit',
            `New INTERNAL ${urgency === 'urgent' ? 'URGENT ' : ''}Work Permit: ${permitNo}`,
            {
              permitId: data.id,
              permitNo,
              workType: permitData.work_description,
              requesterName: `${permitData.external_contact_person} (${permitData.external_company_name})`,
              urgency,
              isInternal: true,
            }
          );
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the permit creation if email fails
      }

      // Send confirmation email to the requester
      try {
        await sendEmailNotification(
          [permitData.requester_email],
          'permit_submitted',
          `Work Permit Request Received: ${permitNo}`,
          {
            permitId: data.id,
            permitNo,
            workDescription: permitData.work_description,
            workLocation: permitData.work_location,
            workDates: `${permitData.work_date_from} to ${permitData.work_date_to}`,
          }
        );
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Work permit request submitted successfully!');
    },
    onError: (error) => {
      console.error('Permit creation error:', error);
      toast.error('Failed to submit permit request. Please try again.');
    },
  });
}
