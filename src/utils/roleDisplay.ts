// Role display helpers.
//
// Dashboards, badges, and approval-chain widgets need a human-readable
// label for a snake_case role name. Historically each page kept its own
// hardcoded map (`{ helpdesk: 'Helpdesk', pm: 'Property Management', ... }`)
// which silently dropped custom roles created via the Roles Management
// UI (e.g. 'al_hamra_customer_service' would render as the raw key).
//
// This module is the single source of truth for that conversion. It's
// pure / synchronous / no data fetch — given a role name, returns a
// label suitable for inline display.
//
// Strategy:
//
//   1. Check the curated label map for the small set of names that
//      deserve a non-mechanical translation ("PM" instead of "Pm",
//      "IT Department" instead of "It", "BDCR" instead of "Bdcr").
//
//   2. Otherwise apply mechanical Title Case to the snake_case key —
//      splitting on underscore, uppercasing each word's first letter.
//
// New custom roles work for free via step 2. Curated entries in step 1
// are only there to handle abbreviations + capitalization quirks that
// mechanical title-casing gets wrong.

/**
 * Curated overrides for role names whose mechanical title-cased form
 * isn't quite right (acronyms, organizational abbreviations).
 *
 * Add an entry here only when Title Case via underscore split produces
 * something wrong — don't list every role. Most custom roles will
 * render correctly via the mechanical fallback.
 */
const CURATED_ROLE_LABELS: Readonly<Record<string, string>> = {
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
  customer_service: 'Customer Service',
  cr_coordinator: 'CR Coordinator',
  head_cr: 'Head of CR',
  fmsp_approval: 'FMSP Approval',
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service',
  admin: 'Administrator',
  tenant: 'Tenant',
};

/**
 * Convert a snake_case role name to a human-readable label.
 *
 * Examples:
 *   humanRoleName('pm')                          -> 'Property Management'
 *   humanRoleName('al_hamra_customer_service')   -> 'Al Hamra Customer Service'
 *   humanRoleName('safety_officer')              -> 'Safety Officer'
 *   humanRoleName('')                            -> ''
 *
 * Pure / sync. Safe to call inside render paths.
 */
export function humanRoleName(name: string | null | undefined): string {
  if (!name) return '';
  const key = name.toLowerCase();
  const curated = CURATED_ROLE_LABELS[key];
  if (curated) return curated;
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Color associated with a role for use in charts/badges.
 *
 * Uses a deterministic hash of the role name to pick from a fixed
 * palette of brand-compatible hues, so a given role's color stays
 * stable across renders without requiring a hardcoded map.
 *
 * Curated overrides exist for legacy roles whose colors were
 * established in earlier UI iterations and shouldn't shift.
 */
const CURATED_ROLE_COLORS: Readonly<Record<string, string>> = {
  helpdesk: '#3b82f6',
  pm: '#8b5cf6',
  pd: '#ec4899',
  bdcr: '#f59e0b',
  mpr: '#10b981',
  it: '#06b6d4',
  fitout: '#84cc16',
  ecovert_supervisor: '#f97316',
  pmd_coordinator: '#ef4444',
  customer_service: '#14b8a6',
  cr_coordinator: '#0ea5e9',
  head_cr: '#6366f1',
  fmsp_approval: '#a855f7',
  admin: '#64748b',
  tenant: '#94a3b8',
};

// Fallback palette — used by mechanical color assignment for any role
// not in CURATED_ROLE_COLORS. Picked from Tailwind 500 colors that
// avoid the few hues already curated above.
const FALLBACK_PALETTE: readonly string[] = [
  '#dc2626', // red-600 — close to brand
  '#d97706', // amber-600
  '#65a30d', // lime-600
  '#0d9488', // teal-600
  '#0284c7', // sky-600
  '#7c3aed', // violet-600
  '#c026d3', // fuchsia-600
  '#be185d', // pink-700
  '#9333ea', // purple-600
  '#15803d', // green-700
];

export function roleColor(name: string | null | undefined): string {
  if (!name) return '#94a3b8';
  const key = name.toLowerCase();
  const curated = CURATED_ROLE_COLORS[key];
  if (curated) return curated;
  // Deterministic-but-spread hash: sum of char codes mod palette length
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}
