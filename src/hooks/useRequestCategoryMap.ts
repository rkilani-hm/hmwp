import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CategoryWorkType {
  request_category: string;
  work_type_id: string;
  work_type_name: string;
}

/**
 * Purpose (request_category) -> the work type that carries its approval
 * workflow. This is what lets the wizard pick the workflow automatically from
 * the chosen purpose instead of asking the user for a work type.
 *
 * Client-scope only: internal requests use different (internal) work types and
 * keep the manual picker, so the wizard applies this map only when scope is
 * 'client'.
 */
export function useRequestCategoryMap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['request-category-map', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, CategoryWorkType>> => {
      const { data, error } = await supabase.rpc('get_request_category_work_types' as any);
      if (error) throw error;
      const map: Record<string, CategoryWorkType> = {};
      for (const row of (data ?? []) as CategoryWorkType[]) map[row.request_category] = row;
      return map;
    },
  });
}
