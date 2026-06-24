# Spec: Delegation — delegator keeps role, visibility, and is not mislabeled a tenant

## Objective
When an approver delegates (e.g. while on leave), they must KEEP their original
role and KEEP seeing the relevant permits/GPs on their dashboard. Delegation
should only stop the delegator from (a) receiving email reminders to approve and
(b) being expected to act — the DELEGATE becomes the actor. An approval by the
delegate must continue to be stamped "approved on behalf of [delegator]". Also
fix the latent bug where a delegator whose effective-role set becomes empty is
mislabeled a tenant by the frontend.

## Root cause (verified live — investigation findings)
- The delegator's `user_roles` are NEVER changed by delegation. Every DB tenant
  check (`is_tenant_user`, `is_non_tenant_staff`, `is_approver`,
  `filter_tenant_notifications`) reads `user_roles` directly and correctly
  reports the delegator as non-tenant.
- The bug: `get_my_effective_roles()` branch 1 SUBTRACTS any role for which an
  active delegation exists (`active_delegation_for(...) IS NULL` filter). For a
  blanket delegation (`role_id = NULL`) ALL the delegator's roles are subtracted;
  if they delegated their only role, the effective set is EMPTY.
- Frontend then mislabels: `useIsTenantOnly()` returns true when
  `normalized.length === 0` ("no roles ⇒ tenant-only"), and
  `isApprover = roles.some(r => r !== 'tenant')` becomes false, so `Index.tsx`
  redirects inbox/outbox away. Net effect: delegator sees a tenant UX and loses
  visibility — the reported "becomes a tenant" symptom.

## Intended behavior (decided by product owner)
| Aspect | Required |
|---|---|
| Delegator's role | KEEPS it (already true in DB; must also be true in effective set) |
| Delegator dashboard/inbox visibility | STILL SEES the permit/GP (awareness) |
| Email reminders to delegator | NOT sent while delegation active |
| Who is expected to act | The DELEGATE (delegator is not the actor) |
| Delegate approval attribution | Stamped "approved on behalf of [delegator]" |

## Requirements

R1. **Stop subtracting the delegated role from the delegator's effective roles.**
    Change `get_my_effective_roles()` so the delegator RETAINS their direct roles
    regardless of active delegations. The delegator must once again appear as a
    holder of their role(s) in the app, restoring dashboard + inbox visibility.
    (The delegate continues to GAIN the delegated role in their own effective set
    — that addition behavior must be preserved.)

R2. **Move the "delegate-only" effect from role-subtraction to the reminder +
    actor layer.** Since R1 restores the delegator to the role, ensure:
    - Email REMINDERS for a pending permit/GP are NOT sent to a delegator who has
      an active delegation covering that step's role; they go to the delegate.
      (This is the automatic-reminder path; coordinate with the pending reminder
      work — the reminder recipient resolution must treat an active delegation as
      "remind the delegate, not the delegator".)
    - Initial/again notifications already reroute to the delegate; preserve that.
    - The delegator seeing the item on their dashboard is allowed and expected;
      only reminders + actor expectation move to the delegate.

R3. **Harden tenant detection to be authoritative (defense-in-depth).** Change
    the frontend tenant determination so "tenant" means the user actually holds
    the `tenant` role (mirror DB `is_tenant_user`), NOT "has zero effective
    roles". Specifically:
    - `useIsTenantOnly()` must not treat an empty effective-role set as
      tenant-only. Base it on presence of the `tenant` role (or an explicit
      authoritative signal from the backend), not absence of other roles.
    - `isApprover` (`AuthContext.tsx`, `Index.tsx`) must not collapse to a tenant
      view purely because the effective set is empty.
    This prevents the whole class of "empty roles ⇒ tenant" bugs even if some
    future logic empties the set.

R4. **Preserve "on behalf of" attribution.** The delegate's approval must remain
    stamped "approved on behalf of [delegator]" (existing
    `authorize_permit_approval.on_behalf_of` + `get_delegation_origin`). Do not
    regress this.

R5. **Actor correctness.** With the delegator's role restored (R1),
    `authorize_permit_approval` would now also allow the DELEGATOR to act on the
    step. Decide and implement the intended rule: the product statement is the
    delegate is the actor, but the delegator is not forcibly blocked from acting
    in the current design. RECOMMENDED: keep both able to act (delegator retains
    authority; delegate gains it) but ensure reminders/expectation point to the
    delegate. If the product owner wants the delegator BLOCKED from acting while
    a delegation is active, state it explicitly — that is a stricter change.
    Spec must make the chosen rule explicit and testable.

## Edge cases
E1. Blanket delegation (`role_id = NULL`): delegator keeps ALL roles in their
    effective set; delegate gains all of them. No empty set.
E2. Specific-role delegation: delegator keeps all roles; delegate gains only the
    delegated role.
E3. Delegation expired/revoked: behavior reverts cleanly; reminders resume to the
    (former) delegator.
E4. Delegator holds multiple roles, delegates one: must still see items for the
    retained roles AND the delegated role (since R1 keeps the role visible).
E5. A genuine tenant (holds only `tenant` role) is unaffected — still tenant UX.
E6. A real "no roles" account (mis-provisioned internal user with zero roles)
    must NOT be auto-shown an approver UX; R3 should base the decision on the
    tenant role's presence, with internal-but-roleless treated as non-approver
    without being labeled "tenant". Define the intended handling.

## Definition of done (verified against LIVE state + a real test)
- [ ] With the live `talomran → dmarafi` blanket delegation ACTIVE:
      `get_my_effective_roles(talomran)` returns talomran's
      `head_of_client_relations_&_leasing_support` role (NOT empty).
- [ ] talomran sees the relevant permits/GPs on their dashboard/inbox while the
      delegation is active (no tenant UX, no redirect).
- [ ] talomran does NOT receive email reminders for those pending items while
      delegated; dmarafi does.
- [ ] dmarafi can act; an approval by dmarafi is stamped "on behalf of
      talomran".
- [ ] `useIsTenantOnly` / `isApprover` no longer flip to tenant on empty
      effective roles; verified by a unit/manual check with an empty set that is
      NOT the tenant role.
- [ ] A genuine tenant still gets tenant UX; an internal user with roles still
      gets approver UX.
- [ ] Chosen actor rule (R5) implemented and tested.
- [ ] App builds; `deno check` passes on any edited function; any DB function
      change verified present in LIVE DB.

## Deployment note (outside the loop)
`get_my_effective_roles` change is a DB migration — apply to Supabase directly
and verify live. Frontend changes deploy via Lovable publish. Reminder-routing
may touch an edge function (deploy needed). A repo merge alone deploys nothing.
