import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ScopedWorkType {
  id: string;
  name: string;
  is_internal: boolean;
}

/**
 * Work types the caller may select, each carrying the authoritative internal /
 * client flag (from the workflow template). Used by the New Request wizard to
 * show internal work types for internal requests and client ones for tenant
 * requests — which in turn selects the matching approval workflow.
 */
export function useScopedWorkTypes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['work-types-scoped', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ScopedWorkType[]> => {
      const { data, error } = await supabase.rpc('list_work_types_with_scope' as any);
      if (error) throw error;
      return (data ?? []) as ScopedWorkType[];
    },
  });
}
