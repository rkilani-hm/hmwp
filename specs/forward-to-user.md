# Spec: Forward a permit step to a specific USER (not a role)

## Objective
Today the "Forward Permit" dialog lets the current approver forward a permit to
another ROLE (via `forward_permit_to_role`). Add the ability to forward the
current step to a specific INTERNAL USER instead. Forwarding to a user GRANTS
that user authority to approve/reject THIS step (product owner decision: no admin
role-grant required). The forwarded user becomes the person in charge of the
current step; the role that forwarded it no longer sees it for this step.

## Decisions (confirmed by product owner)
- Forward target = ANY internal staff member (never tenants).
- Forwarding GRANTS approval authority for this step regardless of the target's
  own roles.
- When forwarded, the permit LEAVES the current role's inbox and moves to the
  forwarded user (analogous to delegation "delegate only").
- Forwarding affects ONLY the current step. Once the forwarded user acts, the
  permit advances normally; the NEXT step routes by role as usual.
- All forwards are logged with attribution.

## Design: reuse the delegation infrastructure, do NOT build a parallel router
The delegation feature already added the authority + routing primitives that the
inbox and notifications understand:
  - `authorize_permit_approval` — server-side approval gate
  - `active_delegation_for` / `get_delegation_origin` — active-delegation
    resolution + audit origin
  - `list_delegatable_employees()` — SECURITY DEFINER, non-tenant staff,
    EXECUTE to authenticated only
  - delegate-only routing in `notify_permit_active_approvers` + inbox query

Forward-to-user is conceptually a SINGLE-PERMIT, single-step delegation created
by the current approver in favor of the chosen user. Implement it by reusing
these primitives rather than adding a `forward_permit_to_user` path the inbox
query cannot read.

## Requirements

R1. **Per-permit forward authorization (DB).** Add a server-side mechanism that
    records "permit P, current step/role R, is forwarded to user U by approver F"
    and is honored by:
    (a) the inbox query (`usePendingPermitsForApprover` / the
        `permit_active_approvers` resolution) — P appears in U's inbox and NOT in
        R's, while the forward is active for this step;
    (b) the approval gate (`authorize_permit_approval` and
        `verify-signature-approval`) — U is authorized to approve/reject step R
        of permit P;
    (c) notifications (`notify_permit_active_approvers`) — the forward
        notification goes to U only.
    Prefer extending the existing delegation/active-approver resolution over a
    new table if it cleanly expresses "scoped to one permit + one step". If a new
    table is needed (e.g. `permit_step_forwards`), it must integrate with the
    SAME resolution path the inbox/gate/notify already use — no second router.

R2. **Forward dialog — user mode (frontend).** In the Forward Permit dialog, add
    the ability to forward to a USER. The user picker MUST source candidates from
    a SECURITY DEFINER RPC returning non-tenant internal staff (reuse
    `list_delegatable_employees()` or an equivalent), NOT a direct
    `profiles` query (which RLS blocks for non-admins — same bug already fixed
    for delegation). Tenants must never appear.

R3. **Authority on approve (DB, server-side).** When U approves/rejects the
    forwarded step, `authorize_permit_approval` (and the
    `verify-signature-approval` edge function) must allow it BECAUSE of the
    active forward — validated server-side (permit + step + forward still
    active), never trusting the client or inbox display. Tenants can never
    approve via forward.

R4. **Single-step scope + normal advancement.** After U acts on step R, the
    permit advances through the workflow exactly as a normal approval would; the
    next step routes by role. The forward does not persist to later steps. If the
    permit is sent to rework / re-enters step R later, define whether the forward
    is consumed (recommended: a forward applies to one occurrence of the step and
    is cleared once acted upon or when the step changes).

R5. **Audit attribution.** Log the forward action ("F forwarded permit P step R
    to U"). When U acts, the activity log entry must record that U acted on the
    forwarded step on behalf of / forwarded by F (mirror the delegation
    "acting on behalf of …" annotation via `get_delegation_origin`-style origin).

R6. **Existing forward-to-ROLE unchanged.** The current `forward_permit_to_role`
    behavior must continue to work; user-forward is an ADDITION, selectable in
    the same dialog.

## Edge cases
E1. Forwarded user is ALSO a holder of role R → no double-notify; U is the single
    recipient; dedupe.
E2. Forward target leaves / is deactivated before acting → the step should be
    recoverable (define: forward can be re-issued, or falls back to role R).
E3. Forwarding an already-forwarded step (re-forward) → last forward wins;
    previous forwarded user loses access to the step.
E4. The forwarder no longer holds R by the time U acts → U's authority derives
    from the recorded forward, not from F's live role; acceptable, but the audit
    must still attribute to F.
E5. Reject by U ends the workflow same as a normal reject.
E6. Tenants excluded as forward targets at RPC + gate + UI levels.

## Definition of done (verified against LIVE state)
- [ ] Forward Permit dialog offers a USER option; the user list is non-tenant
      internal staff sourced via a SECURITY DEFINER RPC (no direct profiles
      query), verified to return a non-empty list for a non-admin approver.
- [ ] Forwarding permit P (current step R) to user U: P appears in U's inbox and
      disappears from R-role holders' inboxes for this step (live test).
- [ ] U receives the forward notification (and U only).
- [ ] U can approve/reject step R; the approval gate authorizes U server-side
      ONLY while the forward is active; an inactive/cleared forward is rejected.
- [ ] A tenant can never be a forward target nor approve via forward (verify at
      RPC + gate).
- [ ] After U acts, the permit advances and the next step routes by role
      normally; the forward does not leak into later steps.
- [ ] Forward + the forwarded approval are both logged with F->U attribution.
- [ ] Forward-to-ROLE still works (no regression).
- [ ] App builds; `deno check` passes on any edited edge function.
- [ ] Any new DB objects/policies exist in LIVE DB (verify via
      pg_policies / information_schema / to_regclass), not just written.

## Deployment note (outside the loop)
Any migration must be APPLIED to Supabase, and `verify-signature-approval` (if
edited) DEPLOYED; frontend deployed via Lovable sync + publish. A repo merge
alone does not deploy DB or edge-function changes. Re-verify the live-DB
checkboxes and run one real forward->approve on NEW data after deploy.
