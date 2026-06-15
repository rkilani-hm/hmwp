import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

// Public hook to create internal permits via the secure
// `submit-public-permit` edge function. The function verifies a
// Cloudflare Turnstile token and enforces a per-IP rate limit before
// inserting the permit with the service role. Anonymous clients no
// longer have direct insert access to work_permits.
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
      turnstileToken: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        'submit-public-permit',
        { body: permitData },
      );

      if (error) {
        // supabase.functions.invoke wraps non-2xx responses in a
        // FunctionsHttpError. Try to surface the server's JSON error.
        let serverMessage: string | undefined;
        let status: number | undefined;
        try {
          const ctx = (error as any).context;
          status = ctx?.status;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            serverMessage = body?.error;
          }
        } catch {
          /* ignore */
        }
        const message =
          serverMessage ||
          (status === 429
            ? 'Too many requests, please try again later.'
            : status === 403
            ? 'CAPTCHA verification failed. Please refresh and try again.'
            : error.message) ||
          'Failed to submit permit request.';
        throw new Error(message);
      }

      if (!data?.permitNo) {
        throw new Error('Unexpected server response.');
      }

      return { id: data.id, permit_no: data.permitNo };
    },
    onSuccess: () => {
      toast.success('Work permit request submitted successfully!');
    },
    onError: (error: Error) => {
      console.error('Permit creation error:', error);
      toast.error(error.message || 'Failed to submit permit request.');
    },
  });
}

