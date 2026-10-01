import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export function useUserPermissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      // Resolve the caller's effective permission names server-side. The
      // permissions/role_permissions tables are admin-only (RLS); this
      // SECURITY DEFINER RPC returns ONLY the current user's own permissions,
      // so no table-wide SELECT is needed.
      const { data, error } = await (supabase as any).rpc('get_my_permissions');
      if (error) throw error;
      return ((data as string[] | null) ?? []);
    },
    enabled: !!user,
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
