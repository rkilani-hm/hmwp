import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Permission {
  id: string;
  name: string;
  label: string;
  description: string | null;
  category: string;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category')
        .order('label');

      if (error) throw error;
      return data as Permission[];
    },
  });
}

export function useRolePermissions(roleId?: string) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: async () => {
      let query = supabase.from('role_permissions').select('*');
      if (roleId) {
        query = query.eq('role_id', roleId);
      }
      const { data, error } = await query;

      if (error) throw error;
      return data as RolePermission[];
    },
    enabled: !!roleId || roleId === undefined,
  });
}

export function useAllRolePermissions() {
  return useQuery({
    queryKey: ['all-role-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*');

      if (error) throw error;
      return data as RolePermission[];
    },
  });
}

export function useToggleRolePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionId, hasPermission }: { 
      roleId: string; 
      permissionId: string; 
      hasPermission: boolean;
    }) => {
      if (hasPermission) {
        // Remove permission
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('permission_id', permissionId);

        if (error) throw error;
      } else {
        // Add permission
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role_id: roleId, permission_id: permissionId });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['all-role-permissions'] });
    },
    onError: (error: any) => {
      toast.error('Failed to update permission: ' + error.message);
    },
  });
}

export function useCreatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (permission: { name: string; label: string; description?: string; category: string }) => {
      const { data, error } = await supabase
        .from('permissions')
        .insert({
          name: permission.name.toLowerCase().replace(/\s+/g, '_'),
          label: permission.label,
          description: permission.description || null,
          category: permission.category,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      toast.success('Permission created successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to create permission: ' + error.message);
    },
  });
}

export function useDeletePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('permissions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['all-role-permissions'] });
      toast.success('Permission deleted successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to delete permission: ' + error.message);
    },
  });
}
