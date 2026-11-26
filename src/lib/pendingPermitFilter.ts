// All remaining enum values are submitted, under_review, or dynamic pending roles.
// Exclusion avoids PostgreSQL LIKE on an enum and includes newly configured roles.
export const NON_PENDING_PERMIT_STATUSES = [
  'draft', 'rework_needed', 'approved', 'rejected', 'closed', 'cancelled', 'superseded',
] as const;