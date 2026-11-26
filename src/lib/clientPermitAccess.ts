/**
 * Shared presentation-only access rules; submission permissions remain server-owned.
 *
 * "Internal staff" is decided by EMAIL DOMAIN, not by role: Al Hamra staff
 * (@alhamra.com.kw) and any Ecovert address (domain contains "ecovert", which
 * covers ecovertfm-kw.com and ecovertfm-kw.net).
 */
const AL_HAMRA_EMAIL_SUFFIX = '@alhamra.com.kw';
const ECOVERT_DOMAIN_MARKER = 'ecovert';

/** True when the address belongs to Al Hamra or Ecovert staff. Case-insensitive. */
export function isInternalStaffEmail(email: string | null | undefined): boolean {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 0) return false;
  const domain = value.slice(at + 1);
  if (!domain) return false;
  return value.endsWith(AL_HAMRA_EMAIL_SUFFIX) || domain.includes(ECOVERT_DOMAIN_MARKER);
}

/**
 * Staff navigation filter. "New Permit" is the client/tenant creation screen, so
 * internal staff keep it only with on-behalf permission; everyone else keeps every
 * other destination (including the internal-request screen).
 */
export function canShowStaffPermitLink(
  path: string,
  email: string | null | undefined,
  canSubmitOnBehalf: boolean,
) {
  if (path !== '/new-permit') return true;
  return canSubmitOnBehalf || !isInternalStaffEmail(email);
}

export function getNewPermitAccess({
  signedIn,
  email,
  loading,
  canSubmitOnBehalf,
}: {
  signedIn: boolean;
  email: string | null | undefined;
  loading: boolean;
  canSubmitOnBehalf: boolean;
}): 'loading' | 'sign-in' | 'internal-request' | 'allow' {
  if (loading) return 'loading';
  if (!signedIn) return 'sign-in';
  if (isInternalStaffEmail(email) && !canSubmitOnBehalf) return 'internal-request';
  return 'allow';
}
