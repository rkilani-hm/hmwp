# Spec: Foundation — Departments + Reviewer/Approver user flag

## Objective
Add two NET-NEW structural concepts that later features build on:
  (1) A `departments` concept, with each INTERNAL user assigned to exactly ONE
      department (tenants have none). Sits ALONGSIDE the existing role system and
      must NOT alter how roles drive the approval workflow. Used later to gate
      confidential comment visibility.
  (2) A per-user "actor type" flag — each user is either an APPROVER or a
      REVIEWER (exactly one). When that user appears in a workflow step, the
      action label is picked up from this flag: an approver sees Approve/Approved,
      a reviewer sees Review/Reviewed. This is a COSMETIC relabel only — a
      reviewer has the SAME workflow power as an approver (advances the step
      identically); only the wording in UI / PDF / audit changes.

## Verified baseline (live)
- No `departments` table, no `profiles.department` column, no reviewer/approver
  flag exist today. (`profiles.account_reviewed_by` is unrelated — account
  signup review — do not reuse it.)
- Roles are flat (`user_roles` → `roles`), drive the workflow, and MUST remain
  the workflow driver. Department + actor-type are additive dimensions only.

## Requirements

R1. **`departments` table.** Create `public.departments` (id uuid PK, name text
    unique not null, created_at). Seed is done by the product owner later (they
    will create departments and assign users) — do NOT hardcode a department
    list. RLS: all authenticated users may SELECT departments (needed for
    pickers); only admins may INSERT/UPDATE/DELETE.

R2. **User → department link (single).** Add `profiles.department_id uuid NULL
    REFERENCES public.departments(id)`. Exactly ZERO or ONE department per user
    (single column, not a join table). Tenants remain NULL. Internal users are
    expected to be assigned (policy), but the column is nullable so assignment
    can happen gradually — downstream features MUST fail closed on NULL (defined
    in the dependent spec), not error.

R3. **Actor-type flag.** Add `profiles.actor_type text NOT NULL DEFAULT
    'approver'` constrained to exactly one of (`approver`,`reviewer`) via a CHECK
    constraint (or a 2-value enum). Every user has exactly one. Default
    `approver` so existing behavior (everyone approves) is unchanged until
    flipped. Tenants' value is irrelevant (they don't act in workflow steps) but
    must still satisfy the constraint — default `approver` is fine.

R4. **Admin UI on the user master.** In the existing user management screen, add:
    - a Department selector (single-select from `departments`), and
    - an Actor Type toggle (Approver / Reviewer, exactly one).
    Admin-only, consistent with existing user-management permissions.

R5. **Workflow label picked from actor_type.** Wherever a user takes a workflow
    action (the approve/reject/rework UI on a permit/GP step, and the
    corresponding labels in the approval timeline, the PDF approval chain, and
    activity log wording), the verb must be derived from the ACTING USER's
    `actor_type`:
    - approver → "Approve" / "Approved"
    - reviewer → "Review" / "Reviewed"
    The underlying action, status transitions, and workflow advancement are
    IDENTICAL regardless of actor_type. Status values in the DB
    (`permit_approvals.status` etc.) stay as-is (e.g. 'approved') — only the
    DISPLAYED verb changes. (If display logic keys on the stored status string,
    map status→verb using the acting user's actor_type at render time; do NOT
    rename stored status values.)

R6. **No workflow logic change.** Roles still determine routing and authority.
    actor_type changes NOTHING about who can act or how the step advances — it is
    purely the displayed label. Verify no regression to approval/forward/
    delegation gating.

R7. **Helper for downstream use.** Provide a clean way to read a user's
    department (e.g. a `get_user_department(uuid)` SECURITY DEFINER helper or a
    column join) that the confidentiality feature can reuse, so that feature does
    not query `profiles` directly under RLS that might block it.

## Edge cases
E1. User with NULL department: allowed at this layer (assignment is gradual);
    dependent features fail closed. The user-master UI should visibly flag
    internal users with no department (a gentle "unassigned" indicator) so the
    admin can complete assignment.
E2. Tenants: department stays NULL; actor_type default is harmless.
E3. Changing a user's actor_type mid-workflow: future actions use the new label;
    already-recorded actions keep whatever was rendered/stored at the time
    (don't rewrite history).
E4. A workflow step's role is held by multiple users with different actor_types:
    the label reflects the user who actually acted, resolved at action/render
    time per row — not a single label for the step.

## Definition of done (verified against LIVE state)
- [ ] `departments` table exists with admin-only write RLS, authenticated SELECT.
- [ ] `profiles.department_id` (nullable FK) and `profiles.actor_type` (NOT NULL,
      CHECK in {approver,reviewer}, default approver) exist live.
- [ ] User-master UI lets an admin set department (single) and actor type
      (exactly one) per user; internal users with no department are visibly
      flagged.
- [ ] A reviewer-flagged user acting on a step shows "Review/Reviewed" in the UI,
      approval timeline, PDF approval chain, and activity log; an approver shows
      "Approve/Approved" — with IDENTICAL workflow advancement for both.
- [ ] No change to routing/authority; approval, forward, and delegation gating
      unregressed (spot-check one approval still advances correctly).
- [ ] `get_user_department`-style helper available for the next spec.
- [ ] App builds; any DB change verified present in live DB; any edited edge
      function passes `deno check`.

## Deployment note (outside the loop)
Migration (tables/columns/RLS/helper) applied to Supabase directly + verified
live; frontend (user-master UI + label logic) deployed via Lovable publish; any
edited edge function deployed. A repo merge alone deploys nothing.
