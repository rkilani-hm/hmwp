import { ReactNode } from 'react';
import { useHasPermission, useHasAnyPermission, useHasAllPermissions, useUserPermissions } from '@/hooks/useHasPermission';
import { Loader2 } from 'lucide-react';

interface PermissionGateProps {
  children: ReactNode;
  /** Single permission required */
  permission?: string;
  /** Any of these permissions grants access */
  anyOf?: string[];
  /** All of these permissions required */
  allOf?: string[];
  /** What to render when permission is denied */
  fallback?: ReactNode;
  /** Show loading spinner while checking */
  showLoading?: boolean;
}

export function PermissionGate({ 
  children, 
  permission, 
  anyOf, 
  allOf,
  fallback = null,
  showLoading = false,
}: PermissionGateProps) {
  const { isLoading } = useUserPermissions();
  const hasSingle = useHasPermission(permission || '');
  const hasAny = useHasAnyPermission(anyOf || []);
  const hasAll = useHasAllPermissions(allOf || []);

  if (showLoading && isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine if access is granted based on props
  let hasAccess = false;
  
  if (permission) {
    hasAccess = hasSingle;
  } else if (anyOf?.length) {
    hasAccess = hasAny;
  } else if (allOf?.length) {
    hasAccess = hasAll;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
