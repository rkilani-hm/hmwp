import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UserWithRole {
  user_id: string;
  role_id: string;
  role_name: string;
  full_name: string | null;
  email: string;
}

export function useUsersByRole() {
  return useQuery({
    queryKey: ['users-by-role'],
    queryFn: async (): Promise<Record<string, UserWithRole[]>> => {
      // First get all user_roles with their role info
      const { data: userRolesData, error: userRolesError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          role_id,
          roles:role_id(name)
        `);

      if (userRolesError) throw userRolesError;

      // Then get active profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_active')
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      // Create a map of active profiles by user id
      const activeProfiles = new Map<string, { full_name: string | null; email: string }>();
      if (profilesData) {
        for (const profile of profilesData) {
          activeProfiles.set(profile.id, {
            full_name: profile.full_name,
            email: profile.email,
          });
        }
      }

      // Group users by role_id, only including active users
      const usersByRole: Record<string, UserWithRole[]> = {};
      
      if (userRolesData) {
        for (const item of userRolesData) {
          const profile = activeProfiles.get(item.user_id);
          if (!profile) continue; // Skip inactive users
          
          const roleId = item.role_id;
          const roleName = (item.roles as any)?.name || 'unknown';
          
          if (!usersByRole[roleId]) {
            usersByRole[roleId] = [];
          }
          
          usersByRole[roleId].push({
            user_id: item.user_id,
            role_id: roleId,
            role_name: roleName,
            full_name: profile.full_name,
            email: profile.email,
          });
        }
      }

      return usersByRole;
    },
  });
}
