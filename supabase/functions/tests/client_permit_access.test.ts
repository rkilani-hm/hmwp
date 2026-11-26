import { describe, expect, test } from 'bun:test';
import {
  canShowStaffPermitLink,
  getNewPermitAccess,
  isInternalStaffEmail,
} from '../../../src/lib/clientPermitAccess';

const ALHAMRA_APPROVER = 'rami.kilani@alhamra.com.kw';
const ALHAMRA_CS = 'alhamracs@alhamra.com.kw';
const ECOVERT_FM = 'supervisor@ecovertfm-kw.com';
const ECOVERT_NET = 'dispatcher@ecovertfm-kw.net';
const TENANT = 'ahmed.sabah@gmail.com';

describe('normal client permit presentation access', () => {
  test('internal staff is decided by email domain', () => {
    expect(isInternalStaffEmail(ALHAMRA_APPROVER)).toBe(true);
    expect(isInternalStaffEmail(ECOVERT_FM)).toBe(true);
    expect(isInternalStaffEmail(ECOVERT_NET)).toBe(true);
    expect(isInternalStaffEmail(TENANT)).toBe(false);
    expect(isInternalStaffEmail('')).toBe(false);
    expect(isInternalStaffEmail(null)).toBe(false);
    expect(isInternalStaffEmail(undefined)).toBe(false);
    expect(isInternalStaffEmail('no-at-sign')).toBe(false);
    expect(isInternalStaffEmail('user@alhamra.com.kw.evil.test')).toBe(false);
    expect(isInternalStaffEmail('user@not-the-domain.test')).toBe(false);
    // Documented rule: any domain containing "ecovert" counts as Ecovert staff.
    expect(isInternalStaffEmail('ops@ecovert-subsidiary.com')).toBe(true);
  });
  test('internal staff matching is case-insensitive', () => {
    expect(isInternalStaffEmail('Rami.Kilani@ALHAMRA.COM.KW')).toBe(true);
    expect(isInternalStaffEmail('Supervisor@EcovertFM-KW.com')).toBe(true);
  });
  test('an @alhamra.com.kw approver without on-behalf permission is redirected', () => {
    expect(
      getNewPermitAccess({
        signedIn: true,
        email: ALHAMRA_APPROVER,
        loading: false,
        canSubmitOnBehalf: false,
      }),
    ).toBe('internal-request');
  });
  test('an @ecovertfm-kw.com user without on-behalf permission is redirected', () => {
    for (const email of [ECOVERT_FM, ECOVERT_NET]) {
      expect(
        getNewPermitAccess({
          signedIn: true,
          email,
          loading: false,
          canSubmitOnBehalf: false,
        }),
      ).toBe('internal-request');
    }
  });
  test('Customer Service at @alhamra.com.kw keeps normal permit creation', () => {
    expect(
      getNewPermitAccess({
        signedIn: true,
        email: ALHAMRA_CS,
        loading: false,
        canSubmitOnBehalf: true,
      }),
    ).toBe('allow');
  });
  test('on-behalf requester and admin are allowed by the same RPC permission', () => {
    for (const email of [ALHAMRA_CS, 'admin@alhamra.com.kw', 'proxy@alhamra.com.kw']) {
      expect(
        getNewPermitAccess({
          signedIn: true,
          email,
          loading: false,
          canSubmitOnBehalf: true,
        }),
      ).toBe('allow');
    }
  });
  test('a tenant external email is unaffected', () => {
    expect(
      getNewPermitAccess({
        signedIn: true,
        email: TENANT,
        loading: false,
        canSubmitOnBehalf: false,
      }),
    ).toBe('allow');
    expect(canShowStaffPermitLink('/new-request', TENANT, false)).toBe(true);
  });
  test('pending permission check cannot expose the wizard or prematurely redirect', () => {
    expect(
      getNewPermitAccess({
        signedIn: true,
        email: ALHAMRA_APPROVER,
        loading: true,
        canSubmitOnBehalf: false,
      }),
    ).toBe('loading');
  });
  test('signed-out visitors are sent to sign-in', () => {
    expect(
      getNewPermitAccess({
        signedIn: false,
        email: null,
        loading: false,
        canSubmitOnBehalf: false,
      }),
    ).toBe('sign-in');
  });
  test('internal staff without on-behalf hide New Permit but retain internal creation', () => {
    expect(canShowStaffPermitLink('/new-permit', ALHAMRA_APPROVER, false)).toBe(false);
    expect(canShowStaffPermitLink('/new-permit', ECOVERT_FM, false)).toBe(false);
    expect(canShowStaffPermitLink('/new-internal-request', ALHAMRA_APPROVER, false)).toBe(true);
  });
  test('authorized staff keep New Permit navigation', () => {
    expect(canShowStaffPermitLink('/new-permit', ALHAMRA_CS, true)).toBe(true);
    expect(canShowStaffPermitLink('/new-permit', ECOVERT_FM, true)).toBe(true);
  });
});
