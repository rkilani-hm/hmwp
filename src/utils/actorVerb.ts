/**
 * actorVerb — cosmetic verb derivation from a user's actor_type.
 *
 * Spec: departments-and-reviewer-flag.md (R5).
 *
 * A user is either an APPROVER or a REVIEWER. When that user appears in a
 * workflow step, ONLY the "approve" verb changes by actor type:
 *   - approver → "Approve" / "Approved"
 *   - reviewer → "Review"  / "Reviewed"
 *
 * This is DISPLAY-ONLY. Stored status values (e.g. permit_approvals.status
 * = 'approved'), workflow advancement, routing, and authority are identical
 * regardless of actor_type. Reject / Rework wording is NOT affected — it is
 * the same for both actor types.
 *
 * Fail-safe: when actorType is null / undefined / unknown we default to the
 * APPROVER wording, so a missing or unresolved flag never produces a broken
 * or surprising label.
 */

export type ActorType = 'approver' | 'reviewer';

/**
 * Returns the displayed approval verb for the given actor type.
 *
 * @param actorType  the acting user's actor_type ('approver' | 'reviewer'),
 *                   or null/undefined when unknown (defaults to approver).
 * @param tense      'imperative' → "Approve" / "Review"
 *                   'past'       → "Approved" / "Reviewed"
 */
export function approveVerb(
  actorType: ActorType | string | null | undefined,
  tense: 'imperative' | 'past',
): string {
  const isReviewer = actorType === 'reviewer';
  if (tense === 'past') {
    return isReviewer ? 'Reviewed' : 'Approved';
  }
  return isReviewer ? 'Review' : 'Approve';
}
