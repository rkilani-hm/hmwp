import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseEdgeFunctionError } from '@/utils/edgeFunctionErrors';

/**
 * Invite a tenant by email. The edge function creates the account and emails an
 * invitation link where the tenant sets a password and completes onboarding.
 */
export function useInviteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; fullName?: string; companyName?: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-tenant', {
        body: {
          email: input.email.trim(),
          fullName: input.fullName?.trim() || undefined,
          companyName: input.companyName?.trim() || undefined,
        },
      });
      if (error) throw new Error(parseEdgeFunctionError(error, data));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tenants'] });
      toast.success(`Invitation sent to ${vars.email}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });
}

/** Admin: flag/unflag a tenant as VIP (priority handling). */
export function useSetTenantVip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, isVip }: { tenantId: string; isVip: boolean }) => {
      const { error } = await supabase.rpc('set_tenant_vip' as any, { p_tenant: tenantId, p_is_vip: isVip });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('VIP status updated');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update VIP status'),
  });
}

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

      if (error) {
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        throw new Error(userFriendlyMessage);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
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
      toast.error(error.message || 'Failed to reset password');
    },
  });
}

export function useSyncUserProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-user-profiles');

      if (error) {
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        throw new Error(userFriendlyMessage);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success(data?.message || 'User profiles synced successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to sync profiles');
    },
  });
}

/**
 * Edit a user's profile fields (full_name, phone, company_name).
 *
 * Email is intentionally NOT updatable here — changing the auth email
 * needs Supabase admin API plus a verification flow, which is beyond
 * the scope of this hook. Use the user's own Settings page (or a
 * dedicated admin-change-email edge function) for email changes.
 *
 * The companies trigger fires on company_name UPDATE so company_id
 * stays in sync automatically.
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      fullName,
      phone,
      companyName,
      departmentId,
      actorType,
    }: {
      userId: string;
      fullName?: string | null;
      phone?: string | null;
      companyName?: string | null;
      // department_id (nullable FK → departments) + actor_type
      // ('approver' | 'reviewer') per departments-and-reviewer-flag.md (R4).
      departmentId?: string | null;
      actorType?: 'approver' | 'reviewer';
    }) => {
      // Build the update payload from only the fields the caller provided
      // (allowing partial updates without clobbering unrelated columns).
      const update: Record<string, string | null> = {};
      if (fullName !== undefined) update.full_name = fullName;
      if (phone !== undefined) update.phone = phone;
      if (companyName !== undefined) update.company_name = companyName;
      if (departmentId !== undefined) update.department_id = departmentId;
      if (actorType !== undefined) update.actor_type = actorType;

      if (Object.keys(update).length === 0) {
        return; // nothing to do
      }

      // department_id / actor_type are not in the generated supabase types
      // yet, so cast the update payload to `any` at the call site (the
      // codebase casts un-generated columns this way elsewhere).
      const { error } = await supabase
        .from('profiles')
        .update(update as any)
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Profile updated');
    },
    onError: (error: any) => {
      toast.error('Failed to update profile: ' + (error.message || 'unknown error'));
    },
  });
}

/**
 * Hard-delete a user via the admin-delete-user edge function. Removes
 * the auth.users row; ON DELETE CASCADE on profiles.id and
 * user_roles.user_id wipes the related rows. Permits and gate passes
 * the user submitted are left intact (their requester_name is
 * denormalised so the historical record stays readable).
 *
 * This is irreversible. Callers should confirm twice before invoking.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId },
      });

      if (error) {
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        throw new Error(userFriendlyMessage);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tenants'] });
      toast.success('User deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });
}
