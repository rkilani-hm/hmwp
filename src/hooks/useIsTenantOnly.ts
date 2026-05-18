/**
 * useIsTenantOnly
 *
 * Returns true when the current user should have tenant-only UX —
 * i.e. they hold the 'tenant' role AND no internal/approver role,
 * OR their roles haven't loaded yet (default to the more restrictive
 * view so we don't flash internal-only UI to tenants while auth resolves).
 *
 * Why "tenant-only" instead of just hasRole('tenant'): a user who is
 * both a tenant AND an approver still needs to see approval-progress
 * panels because they may be approving permits themselves.
 *
 * Role comparison is case-insensitive in case the DB ever stores a
 * differently-cased variant.
 */
import { useAuth } from '@/contexts/AuthContext';

export function useIsTenantOnly(): boolean {
  const { roles, loading, user } = useAuth();

  // Not signed in → not a tenant view at all
  if (!user) return false;

  // While auth/roles are loading, default to "tenant view" so we
  // never briefly leak internal-only UI to a tenant.
  if (loading) return true;

  const normalized = (roles ?? []).map((r) => String(r).toLowerCase());
  const hasTenant = normalized.includes('tenant');
  const hasOther = normalized.some((r) => r && r !== 'tenant');

  // No roles assigned at all → treat as tenant-only (most restrictive)
  if (normalized.length === 0) return true;

  return hasTenant && !hasOther;
}
