/** Shared presentation-only access rules; submission permissions remain server-owned. */
export function canShowStaffPermitLink(path: string, canSubmitOnBehalf: boolean) {
  return path !== '/new-permit' || canSubmitOnBehalf;
}

export function getNewPermitAccess({
  signedIn,
  isInternalStaff,
  loading,
  canSubmitOnBehalf,
}: {
  signedIn: boolean;
  isInternalStaff: boolean;
  loading: boolean;
  canSubmitOnBehalf: boolean;
}): 'loading' | 'sign-in' | 'internal-request' | 'allow' {
  if (loading) return 'loading';
  if (!signedIn) return 'sign-in';
  if (isInternalStaff && !canSubmitOnBehalf) return 'internal-request';
  return 'allow';
}