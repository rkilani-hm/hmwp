import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Role {
  id: string;
  name: string;
  label: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('label');

      if (error) throw error;
      return data as Role[];
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (role: { name: string; label: string; description?: string }) => {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          name: role.name.toLowerCase().replace(/\s+/g, '_'),
          label: role.label,
          description: role.description || null,
          is_system: false,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role created successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to create role: ' + error.message);
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; label?: string; description?: string; is_active?: boolean }) => {
      const { data, error } = await supabase
        .from('roles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role updated successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to update role: ' + error.message);
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', id);

      if (error) {
        // FK constraint errors from PostgreSQL surface as code 23503.
        // Most likely: workflow_steps.role_id ON DELETE RESTRICT.
        // user_roles is CASCADE so assigned users won't block delete.
        // permit_approvals / gate_pass_approvals are SET NULL so
        // historical rows lose their role link but the row survives.
        if (error.code === '23503' || /foreign key|violates/i.test(error.message)) {
          throw new Error(
            'This role is still used by one or more workflow steps. ' +
            'Remove it from those workflows first, or deactivate the role instead of deleting it.',
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['role-usage'] });
      toast.success('Role deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete role');
    },
  });
}

/**
 * Pre-flight check: how many users and workflow steps currently
 * reference this role. The Delete dialog uses these to show the
 * admin what will break / what's safe.
 *
 * Counts are computed in parallel via three head: count queries.
 * Disabled when roleId is undefined so the hook works in a dialog
 * that mounts before a row is selected.
 */
export interface RoleUsage {
  userCount: number;
  workflowStepCount: number;
  permitApprovalCount: number;
  gatePassApprovalCount: number;
}

export function useRoleUsage(roleId: string | undefined) {
  return useQuery<RoleUsage>({
    queryKey: ['role-usage', roleId],
    enabled: !!roleId,
    queryFn: async () => {
      if (!roleId) {
        return { userCount: 0, workflowStepCount: 0, permitApprovalCount: 0, gatePassApprovalCount: 0 };
      }

      const [users, steps, permits, gatePasses] = await Promise.all([
        supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role_id', roleId),
        supabase.from('workflow_steps').select('*', { count: 'exact', head: true }).eq('role_id', roleId),
        supabase.from('permit_approvals').select('*', { count: 'exact', head: true }).eq('role_id', roleId),
        supabase.from('gate_pass_approvals').select('*', { count: 'exact', head: true }).eq('role_id', roleId),
      ]);

      return {
        userCount: users.count ?? 0,
        workflowStepCount: steps.count ?? 0,
        permitApprovalCount: permits.count ?? 0,
        gatePassApprovalCount: gatePasses.count ?? 0,
      };
    },
  });
}
