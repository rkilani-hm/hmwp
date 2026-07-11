import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContractorOverview {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  trade: string | null;
  tenant_count: number;
  wp_count: number;
  gp_count: number;
  last_used: string | null;
  created_at: string;
}

export interface ContractorTenant {
  tenant_id: string;
  tenant_name: string | null;
  company: string | null;
  usage_count: number;
  last_used_at: string | null;
}

// Admin/staff overview of every contractor with usage counts.
export function useContractorOverview() {
  return useQuery({
    queryKey: ['contractor-overview'],
    queryFn: async (): Promise<ContractorOverview[]> => {
      const { data, error } = await supabase.rpc('contractor_overview' as any);
      if (error) throw error;
      return (data ?? []) as ContractorOverview[];
    },
  });
}

// The tenants that use a given contractor (drill-down).
export function useContractorTenants(contractorId: string | null) {
  return useQuery({
    queryKey: ['contractor-tenants', contractorId],
    enabled: !!contractorId,
    queryFn: async (): Promise<ContractorTenant[]> => {
      const { data, error } = await supabase.rpc('contractor_tenants' as any, {
        p_contractor_id: contractorId,
      });
      if (error) throw error;
      return (data ?? []) as ContractorTenant[];
    },
  });
}
