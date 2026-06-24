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

  // "Tenant-only" is authoritative on the tenant role being present (mirrors the
  // DB is_tenant_user check) — NOT "has zero effective roles". An empty set must
  // not be treated as tenant: e.g. a delegator who delegated all their roles, or
  // a mis-provisioned internal account with no roles, are internal — they get a
  // non-tenant (non-approver) view, never tenant UX. Prevents the whole
  // "empty roles => tenant" class of bugs.
  return hasTenant && !hasOther;
}
