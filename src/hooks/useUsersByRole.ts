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
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          role_id,
          roles:role_id(name),
          profiles:user_id(full_name, email, is_active)
        `)
        .eq('profiles.is_active', true);

      if (error) throw error;

      // Group users by role_id
      const usersByRole: Record<string, UserWithRole[]> = {};
      
      if (data) {
        for (const item of data) {
          const roleId = item.role_id;
          const roleName = (item.roles as any)?.name || 'unknown';
          const profile = item.profiles as any;
          
          if (!profile || profile.is_active === false) continue;
          
          if (!usersByRole[roleId]) {
            usersByRole[roleId] = [];
          }
          
          usersByRole[roleId].push({
            user_id: item.user_id,
            role_id: roleId,
            role_name: roleName,
            full_name: profile?.full_name || null,
            email: profile?.email || '',
          });
        }
      }

      return usersByRole;
    },
  });
}
