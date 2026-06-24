# Spec: Fix Approval Delegation (end-to-end)

## Objective
The approval-delegation feature is frontend-complete but backend-missing. The
React page (`src/pages/MyDelegations.tsx`), dialog, and hook
(`src/hooks/useApprovalDelegations.ts`) are deployed, but the
`approval_delegations` table they read/write **does not exist in the live
database**, and the "Pick a teammate" dropdown is empty for every non-admin
because RLS on `profiles` lets a non-admin read only their own row.

Make the feature work end-to-end with this authorization model (decided by the
product owner): **an active delegation alone authorizes the delegate to approve
on the delegator's behalf — no admin role-grant is required.** When a delegation
is active, the step's approval notifications and inbox visibility route to the
delegate (the person now in charge), not the delegator.

## Context the build MUST verify against live state (do not trust the stale clone)
- Latest live commit at spec time: `05598c03998f060f0e6e0d35148292302b728d91`.
- The local clone is stale. Read live values before building: exact column names
  on `profiles`, `user_roles`, `roles`, `permit_approvals`,
  `permit_active_approvers`, `permit_pending_approvals`; and the bodies of the
  `notify_permit_active_approvers` and `is_approver` functions, and the
  `verify-signature-approval` edge function.
- Roles are normalized: `user_roles(user_id, role_id)` → `roles(id, name, label)`.
  There is NO `user_roles.role` text column. Admin check pattern used elsewhere:
  `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND r.name = 'admin')`.
- `profiles` SELECT policies today: admins can read all; everyone else only their
  own (`id = auth.uid()`). DO NOT loosen this policy.
- Tenants are identified by holding the `tenant` role (and only that). Non-tenant
  staff = any user holding at least one role that is not `tenant`.
- The hook expects table `public.approval_delegations` with columns:
  `id, delegator_id, delegate_id, role_id (nullable), valid_from, valid_to,
   reason (nullable), is_active, created_at, updated_at`, plus a FK
  `role_id → roles(id)` (the hook does `roles:role_id(name, label)`).
- The dialog currently queries `profiles` directly for candidates; it will be
  repointed at a new RPC (see R2).

## Requirements

R1. **Create `public.approval_delegations`** (migration) matching the hook's
    expected shape exactly:
    - `id uuid PK default gen_random_uuid()`
    - `delegator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
    - `delegate_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
    - `role_id uuid NULL REFERENCES public.roles(id) ON DELETE CASCADE`
    - `valid_from timestamptz NOT NULL`
    - `valid_to timestamptz NOT NULL`
    - `reason text NULL`
    - `is_active boolean NOT NULL DEFAULT true`
    - `created_at timestamptz NOT NULL DEFAULT now()`
    - `updated_at timestamptz NOT NULL DEFAULT now()`
    - CHECK `valid_to > valid_from`; CHECK `delegator_id <> delegate_id`.
    - Indexes on `(delegate_id, is_active, valid_from, valid_to)` and
      `(delegator_id)`.
    - Attach the existing `update_updated_at_column()` trigger for `updated_at`.

R2. **`profiles` dropdown fix without weakening RLS.** Add a `SECURITY DEFINER`
    function `public.list_delegatable_employees()` that returns
    `id, full_name, email` for all users who hold at least one non-`tenant` role,
    excluding the caller and excluding tenants entirely. `GRANT EXECUTE` to
    `authenticated` only (NOT `anon`/`public`) — consistent with the project's
    revoke-anon posture. Pin `SET search_path = public`. Repoint the dialog's
    candidate query in `MyDelegations.tsx` to call this RPC instead of
    `supabase.from('profiles').select(...)`.

R3. **RLS on `approval_delegations`:**
    - Enable RLS.
    - SELECT: rows where `delegator_id = auth.uid() OR delegate_id = auth.uid()`
      (the hook splits client-side). Admins may also SELECT all.
    - INSERT: `WITH CHECK (delegator_id = auth.uid())` — you may only delegate
      your OWN authority. AND the caller must not be a tenant-only user, AND the
      `delegate_id` must be a non-tenant staff user (reuse the R2 staff test).
    - UPDATE (revoke): `USING (delegator_id = auth.uid())` — only the delegator
      can revoke; the only field the app updates is `is_active`.
    - No DELETE policy.
    - `GRANT SELECT, INSERT, UPDATE ON public.approval_delegations TO authenticated;`

R4. **Active-delegation resolution (server-side, authoritative).** Add a
    `SECURITY DEFINER` helper `public.active_delegation_for(p_delegator uuid,
    p_role_id uuid)` (or equivalent) that returns the delegate currently acting
    for a given delegator+role, where "active" = `is_active = true AND now()
    BETWEEN valid_from AND valid_to`, and `role_id IS NULL` (all roles) matches
    any role. This is the single source of truth used by both notifications
    (R5) and the approve check (R6). Pin search_path.

R5. **Reroute notifications + inbox to the delegate when a delegation is active.**
    - Teach `notify_permit_active_approvers` (and whatever resolves the current
      step's approver set) so that for each user who would be notified as the
      active approver of the current step, if an active delegation exists from
      that user for the step's role, the notification recipient becomes the
      **delegate only** (not the delegator) for the duration of the window.
    - The approver inbox query must likewise show the permit to the delegate
      while the delegation is active. When the window ends, visibility and
      notifications revert to the delegator automatically (no data migration —
      it's purely time-window driven).
    - Recipient decision (product owner): **delegate only** while active.

R6. **Delegation authorizes the approval (no admin role-grant).** In
    `verify-signature-approval` (and any RLS/SECURITY DEFINER gate on writing to
    `permit_approvals`), allow the approval to go through when the acting user is
    EITHER the genuine active approver for the step OR a delegate with an active
    delegation (R4) from a genuine active approver for that step's role. The
    delegation must be validated server-side at approval time — active window,
    `is_active`, delegator actually held the step's role — never trusting the
    client or the inbox display alone. Tenants can never approve via delegation.

R7. **Logging / audit attribution.**
    - Log every delegation create and revoke to the project's established
      activity/audit log.
    - When a delegate approves under a delegation, the approval's audit entry
      MUST record "acting on behalf of <delegator>" (the UI already references
      this phrasing) — capture both the delegate's identity and the delegator's.

R8. **Update the "How it works" copy** in `MyDelegations.tsx` to match the new
    model: remove the now-incorrect "ask an admin to grant the role" step
    (Step 2 in the current dialog warning and the page card), and state that an
    active delegation takes effect immediately and routes the step to the
    delegate until it expires or is revoked.

## Edge cases
E1. `role_id IS NULL` (delegate all my roles) must route every role the
    delegator holds for the relevant step; a specific `role_id` routes only that
    role.
E2. Overlapping/duplicate active delegations from the same delegator for the
    same role: define and implement a deterministic winner (e.g. most recently
    created active one). Do not notify two delegates for one delegator-step.
E3. Delegation window starts in the future ("scheduled") — must NOT route until
    `valid_from`. Already-expired or revoked delegations must never route.
E4. Delegator and delegate are both genuine approvers for the same step — do not
    double-notify; the delegate (acting) should be the recipient, deduped.
E5. A tenant must not appear in `list_delegatable_employees()`, must not be
    insertable as `delegate_id`, and a tenant-only user must not be able to
    create a delegation at all.
E6. Self-delegation blocked at both DB (CHECK) and RPC/UI levels.
E7. Revoking mid-window immediately reverts routing to the delegator.
E8. Final-approval path (`isFinalApproval`) must still work when the approver is
    a delegate — the approved email/CC logic is unaffected except that the
    acting approver is the delegate.

## Definition of done (the /review step verifies each, against LIVE state)
- [ ] `to_regclass('public.approval_delegations')` is non-null in the live DB
      (migration actually applied, not just written).
- [ ] Table columns/constraints/indexes match R1 exactly (verify via
      information_schema / pg_constraint).
- [ ] RLS policies on `approval_delegations` match R3 (verify via pg_policies):
      involving-me SELECT, self-only INSERT, delegator-only UPDATE, no DELETE.
- [ ] `list_delegatable_employees()` exists, is SECURITY DEFINER with
      `search_path=public`, EXECUTE granted to `authenticated` and NOT to
      `anon`/`public`; returns non-tenant staff excluding the caller; returns a
      non-empty list when called as a non-admin approver (e.g. simulate for
      `talomran@alhamra.com.kw`).
- [ ] `profiles` SELECT policies are UNCHANGED (still own-row-only for
      non-admins) — confirm the dropdown fix did not loosen them.
- [ ] The dialog candidate query in `MyDelegations.tsx` now calls the RPC, not
      `profiles` directly.
- [ ] Creating a delegation as a non-admin approver succeeds and the row
      appears; "Delegations I created" lists it; revoke flips `is_active=false`.
- [ ] With an ACTIVE delegation from approver A (role R) to employee B on a
      permit pending at step R: the approval notification goes to B only (not A),
      and the permit appears in B's inbox; before `valid_from` and after
      `valid_to`/revoke it goes to A.
- [ ] B can approve that step purely via the delegation (no admin role grant),
      and the approval is rejected server-side if the delegation is inactive,
      expired, or B is a tenant.
- [ ] The approval audit entry for B's action records "acting on behalf of A".
- [ ] Delegation create/revoke are logged.
- [ ] App builds; `deno check` passes on the edited edge function.
- [ ] "How it works" copy no longer instructs asking an admin to grant a role.

## Deployment note (outside the loop, but required for "done" to be real)
A repo merge does NOT create the table or deploy the edge function on HMWP.
After the loop passes: apply the migration to Supabase and deploy
`verify-signature-approval` (and any other edited function), then re-verify the
live-DB checkboxes above with direct queries.
