import { describe, expect, test } from 'bun:test';
import { canShowStaffPermitLink, getNewPermitAccess } from '../../../src/lib/clientPermitAccess';

describe('normal client permit presentation access', () => {
  test('regular internal approver cannot open normal permit creation', () => {
    expect(getNewPermitAccess({ signedIn: true, isInternalStaff: true, loading: false, canSubmitOnBehalf: false })).toBe('internal-request');
  });
  test('Customer Service with on-behalf permission can open normal permit creation', () => {
    expect(getNewPermitAccess({ signedIn: true, isInternalStaff: true, loading: false, canSubmitOnBehalf: true })).toBe('allow');
  });
  test('on-behalf requester and admin are allowed by the same RPC permission', () => {
    for (const role of ['on_behalf_requester', 'admin']) {
      expect(getNewPermitAccess({ signedIn: true, isInternalStaff: role !== 'tenant', loading: false, canSubmitOnBehalf: true })).toBe('allow');
    }
  });
  test('pending permission check cannot expose the wizard or prematurely redirect', () => {
    expect(getNewPermitAccess({ signedIn: true, isInternalStaff: true, loading: true, canSubmitOnBehalf: false })).toBe('loading');
  });
  test('tenant creation access stays unchanged without on-behalf permission', () => {
    expect(getNewPermitAccess({ signedIn: true, isInternalStaff: false, loading: false, canSubmitOnBehalf: false })).toBe('allow');
    expect(canShowStaffPermitLink('/new-request', false)).toBe(true);
  });
  test('regular staff cannot see New Permit but retain internal creation', () => {
    expect(canShowStaffPermitLink('/new-permit', false)).toBe(false);
    expect(canShowStaffPermitLink('/new-internal-request', false)).toBe(true);
  });
  test('authorized staff keep New Permit navigation', () => {
    expect(canShowStaffPermitLink('/new-permit', true)).toBe(true);
  });
});