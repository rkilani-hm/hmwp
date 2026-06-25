import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Department {
  id: string;
  name: string;
  created_at?: string;
}

/**
 * Fetch all departments ordered by name.
 *
 * Spec: departments-and-reviewer-flag.md (R4). Used by the admin
 * user-master UI to populate the Department single-select and by the
 * Departments management screen. RLS allows any authenticated user to
 * SELECT departments, so no role gate here; writes are admin-only (RLS).
 *
 * The generated supabase types may not yet include the `departments`
 * table, so the call sites are cast to `any` (consistent with the rest
 * of the codebase, which casts un-generated tables/rpcs).
 */
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await (supabase as any)
        .from('departments')
        .select('id, name, created_at')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}

/**
 * Per-department member count (profiles.department_id). Used by the
 * delete confirmation so the admin sees how many users will be
 * unassigned (the FK is ON DELETE SET NULL, so members are simply
 * cleared, not deleted).
 */
export function useDepartmentMemberCounts() {
  return useQuery({
    queryKey: ['department-member-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('department_id')
        .not('department_id', 'is', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { department_id: string }[]) {
        counts[row.department_id] = (counts[row.department_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Department name is required.');
      const { error } = await (supabase as any).from('departments').insert({ name: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department created');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Failed to create department';
      // Friendlier message for the unique-name violation.
      toast.error(/duplicate|unique/i.test(msg) ? 'A department with that name already exists.' : msg);
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Department name is required.');
      const { error } = await (supabase as any).from('departments').update({ name: trimmed }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department renamed');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Failed to rename department';
      toast.error(/duplicate|unique/i.test(msg) ? 'A department with that name already exists.' : msg);
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('departments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['department-member-counts'] });
      // Members were unassigned (FK SET NULL) — refresh user lists too.
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Department deleted');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete department');
    },
  });
}
