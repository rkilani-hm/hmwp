import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success(`User ${isActive ? 'enabled' : 'disabled'} successfully`);
    },
    onError: (error: any) => {
      toast.error('Failed to update user status: ' + error.message);
    },
  });
}

export function useUpdateUserCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, companyName }: { userId: string; companyName: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ company_name: companyName })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Company updated successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to update company: ' + error.message);
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async ({ userId, newPassword, sendResetEmail }: { 
      userId: string; 
      newPassword?: string; 
      sendResetEmail?: boolean 
    }) => {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { userId, newPassword, sendResetEmail },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { sendResetEmail }) => {
      if (sendResetEmail) {
        toast.success('Password reset email sent');
      } else {
        toast.success('Password updated successfully');
      }
    },
    onError: (error: any) => {
      toast.error('Failed to reset password: ' + error.message);
    },
  });
}

export function useSyncUserProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-user-profiles');

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success(data?.message || 'User profiles synced successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to sync profiles: ' + error.message);
    },
  });
}
