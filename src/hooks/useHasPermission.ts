import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

interface PermissionData {
  permission_id: string;
  permissions: {
    name: string;
  };
}

export function useUserPermissions() {
  const { roles, user } = useAuth();

  return useQuery({
    queryKey: ['user-permissions', user?.id, roles],
    queryFn: async () => {
      if (!roles.length) return [];

      // Get role IDs for the user's roles
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id, name')
        .in('name', roles)
        .eq('is_active', true);

      if (roleError) throw roleError;
      if (!roleData?.length) return [];

      const roleIds = roleData.map(r => r.id);

      // Get permissions for those roles
      const { data: permData, error: permError } = await supabase
        .from('role_permissions')
        .select('permission_id, permissions(name)')
        .in('role_id', roleIds);

      if (permError) throw permError;

      // Extract unique permission names
      const permissionNames = new Set<string>();
      (permData as PermissionData[] || []).forEach(rp => {
        if (rp.permissions?.name) {
          permissionNames.add(rp.permissions.name);
        }
      });

      return Array.from(permissionNames);
    },
    enabled: !!user && roles.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useHasPermission(permissionName: string): boolean {
  const { data: permissions, isLoading } = useUserPermissions();
  
  return useMemo(() => {
    if (isLoading || !permissions) return false;
    return permissions.includes(permissionName);
  }, [permissions, permissionName, isLoading]);
}

export function useHasAnyPermission(permissionNames: string[]): boolean {
  const { data: permissions, isLoading } = useUserPermissions();
  
  return useMemo(() => {
    if (isLoading || !permissions) return false;
    return permissionNames.some(name => permissions.includes(name));
  }, [permissions, permissionNames, isLoading]);
}

export function useHasAllPermissions(permissionNames: string[]): boolean {
  const { data: permissions, isLoading } = useUserPermissions();
  
  return useMemo(() => {
    if (isLoading || !permissions) return false;
    return permissionNames.every(name => permissions.includes(name));
  }, [permissions, permissionNames, isLoading]);
}

// Component wrapper for permission-based rendering
export function usePermissionCheck() {
  const { data: permissions, isLoading } = useUserPermissions();

  const hasPermission = useMemo(() => {
    return (permissionName: string) => {
      if (isLoading || !permissions) return false;
      return permissions.includes(permissionName);
    };
  }, [permissions, isLoading]);

  const hasAnyPermission = useMemo(() => {
    return (permissionNames: string[]) => {
      if (isLoading || !permissions) return false;
      return permissionNames.some(name => permissions.includes(name));
    };
  }, [permissions, isLoading]);

  const hasAllPermissions = useMemo(() => {
    return (permissionNames: string[]) => {
      if (isLoading || !permissions) return false;
      return permissionNames.every(name => permissions.includes(name));
    };
  }, [permissions, isLoading]);

  return {
    permissions: permissions || [],
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
