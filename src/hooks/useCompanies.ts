import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyOption {
  id: string;
  name: string;
  user_count: number;
}

/** Existing companies (with user counts) for the admin company picker. */
export function useCompanies() {
  return useQuery({
    queryKey: ['companies-list'],
    queryFn: async (): Promise<CompanyOption[]> => {
      const { data, error } = await supabase.rpc('list_companies' as any);
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
  });
}
