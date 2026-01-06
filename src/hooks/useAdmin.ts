import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  is_active: boolean;
  roles: string[];
}

export interface WorkTypeData {
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
  created_at: string;
}

// Fetch all users with their roles
export function useUsersWithRoles() {
  const { user, hasRole } = useAuth();

  return useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      // First get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (profilesError) throw profilesError;

      // Then get all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine the data
      const usersWithRoles: UserWithRoles[] = profiles.map((profile) => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        company_name: profile.company_name,
        phone: profile.phone,
        is_active: profile.is_active !== false,
        roles: userRoles
          .filter((ur) => ur.user_id === profile.id)
          .map((ur) => ur.role),
      }));

      return usersWithRoles;
    },
    enabled: !!user && hasRole('admin'),
  });
}

// Add role to user
export function useAddUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      // Cast to the expected enum type
      type AppRole = 'admin' | 'bdcr' | 'contractor' | 'fitout' | 'helpdesk' | 'it' | 'mpr' | 'pd' | 'pm' | 'ecovert_supervisor' | 'pmd_coordinator';
      const { data, error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as AppRole })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Role added successfully');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('User already has this role');
      } else {
        toast.error('Failed to add role: ' + error.message);
      }
    },
  });
}

// Remove role from user
export function useRemoveUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      type AppRole = 'admin' | 'bdcr' | 'contractor' | 'fitout' | 'helpdesk' | 'it' | 'mpr' | 'pd' | 'pm' | 'ecovert_supervisor' | 'pmd_coordinator';
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role as AppRole);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Role removed successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to remove role: ' + error.message);
    },
  });
}

// Fetch all work types
export function useAdminWorkTypes() {
  const { user, hasRole } = useAuth();

  return useQuery({
    queryKey: ['admin-work-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as WorkTypeData[];
    },
    enabled: !!user && hasRole('admin'),
  });
}

// Create work type
export function useCreateWorkType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workType: Omit<WorkTypeData, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('work_types')
        .insert(workType)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-work-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-types'] });
      toast.success('Work type created successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to create work type: ' + error.message);
    },
  });
}

// Update work type
export function useUpdateWorkType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...workType
    }: Partial<WorkTypeData> & { id: string }) => {
      const { data, error } = await supabase
        .from('work_types')
        .update(workType)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-work-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-types'] });
      toast.success('Work type updated successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to update work type: ' + error.message);
    },
  });
}

// Delete work type
export function useDeleteWorkType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_types').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-work-types'] });
      queryClient.invalidateQueries({ queryKey: ['work-types'] });
      toast.success('Work type deleted successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to delete work type: ' + error.message);
    },
  });
}
