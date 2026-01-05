import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  action_type: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function useUserActivityLogs(userId?: string) {
  return useQuery({
    queryKey: ['user-activity-logs', userId],
    queryFn: async () => {
      let query = supabase
        .from('user_activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as UserActivityLog[];
    },
  });
}

export function useLogUserActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      userEmail,
      actionType,
      details,
    }: {
      userId: string;
      userEmail: string;
      actionType: string;
      details?: string;
    }) => {
      const { error } = await supabase.from('user_activity_logs').insert({
        user_id: userId,
        user_email: userEmail,
        action_type: actionType,
        details,
        user_agent: navigator.userAgent,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-activity-logs'] });
    },
  });
}

export const ACTION_TYPES = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  PASSWORD_CHANGE: 'password_change',
  PROFILE_UPDATE: 'profile_update',
  PERMIT_CREATE: 'permit_create',
  PERMIT_APPROVE: 'permit_approve',
  PERMIT_REJECT: 'permit_reject',
  PERMIT_FORWARD: 'permit_forward',
  PERMIT_REWORK: 'permit_rework',
  USER_CREATE: 'user_create',
  USER_ROLE_CHANGE: 'user_role_change',
  USER_STATUS_CHANGE: 'user_status_change',
} as const;

export const actionTypeLabels: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  login_failed: 'Failed Login',
  password_change: 'Password Changed',
  profile_update: 'Profile Updated',
  permit_create: 'Permit Created',
  permit_approve: 'Permit Approved',
  permit_reject: 'Permit Rejected',
  permit_forward: 'Permit Forwarded',
  permit_rework: 'Permit Rework Requested',
  user_create: 'User Created',
  user_role_change: 'Role Changed',
  user_status_change: 'Status Changed',
};
