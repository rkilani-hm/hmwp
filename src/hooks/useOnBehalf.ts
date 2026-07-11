import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OnBehalfTenant {
  id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  is_vip: boolean;
  unit: string | null;
  floor: string | null;
}

/** Whether the current user may raise permits/passes on behalf of a tenant. */
export function useCanSubmitOnBehalf() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['can-submit-on-behalf', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('can_submit_on_behalf' as any, { p_user: user!.id });
      if (error) return false;
      return !!data;
    },
  });
}

/** Tenants the current staff user can submit on behalf of (VIPs first). */
export function useOnBehalfTenants(enabled = true) {
  return useQuery({
    queryKey: ['onbehalf-tenants'],
    enabled,
    queryFn: async (): Promise<OnBehalfTenant[]> => {
      const { data, error } = await supabase.rpc('list_onbehalf_tenants' as any);
      if (error) throw error;
      return (data ?? []) as OnBehalfTenant[];
    },
  });
}
