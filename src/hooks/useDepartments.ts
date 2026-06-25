import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Department {
  id: string;
  name: string;
}

/**
 * Fetch all departments (id, name) ordered by name.
 *
 * Spec: departments-and-reviewer-flag.md (R4). Used by the admin
 * user-master UI to populate the Department single-select. RLS allows
 * any authenticated user to SELECT departments, so no role gate here.
 *
 * The generated supabase types may not yet include the `departments`
 * table, so the call site is cast to `any` (consistent with the rest of
 * the codebase, which casts un-generated tables/rpcs).
 */
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}
