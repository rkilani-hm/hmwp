# Spec: Gate Pass active-approver resolution (parity with Work Permit inbox)

## Objective
Resolve "which Gate Pass (GP) is pending whose action right now" using the SAME
mechanism Work Permits (WP) use — a current-step active-approver source plus a
SECURITY DEFINER inbox RPC — instead of the current client-side
`status === 'pending_<role>'` string match. This makes GP delegation/forward-aware
and removes the fragile status-string coupling.

## Findings from live investigation (authoritative basis)
- WP uses `permit_active_approvers` (view, current-step only) → `get_my_inbox_permits()`
  (SECURITY DEFINER, delegation/forward-aware) consumed by `usePendingPermitsForApprover`.
- GP has NO `gate_pass_active_approvers` view and NO `get_my_gate_pass_inbox` RPC.
- `GatePassApprovals.tsx` (lines 33–43) filters client-side:
  `passes.filter(p => roles.some(role => p.status === ` + "`pending_${role}`" + `))`.
- `gate_pass_approvals` table EXISTS but is **EMPTY (0 rows)** — the dual-write
  scaffolding is not populated. GP's real approval state is the LEGACY
  `gate_passes.status` (`pending_<role_name>`) + per-role columns
  (`store_manager_*`, `finance_*`, `cr_coordinator_*`, `head_cr_*`, `security_*`,
  `security_pmd_*`, `hm_security_pmd_*`).
- Live GP statuses use the real custom role name, e.g.
  `pending_coordinator‑_client_relations` (note the non-ASCII hyphen). The 6 GP
  workflows are per `gate_pass_type_workflows.pass_type`
  (asset_transfer, contractor_tools, internal_shifting, material_in, material_out,
  scrap_disposal).

## Decision needed (confirm before build)
- [DECISION] Source of the "current step" for GP. Recommended (pragmatic, given
  `gate_pass_approvals` is empty): derive the active role from `gate_passes.status`
  (`pending_<role>`) joined to `gate_pass_type_workflows`, NOT from the empty
  `gate_pass_approvals` table. The ALTERNATIVE (fix the dual-write so
  `gate_pass_approvals` is the source like WP's `permit_approvals`) is larger and
  is its own spec — flag if you want that instead.

## Requirements
R1. **`gate_pass_active_approvers` view** mirroring `permit_active_approvers`:
    one row per (gate_pass, current-active-role). Current step derived from
    `gate_passes.status` → role, excluding terminal states
    (approved/rejected/cancelled/completed/draft) and archived passes. Expose the
    fields the inbox/cards need (pass_no, requester_name, pass_type, sla if any,
    role_id, role_name, gate_pass_id).
R2. **`get_my_gate_pass_inbox()` RPC** (SECURITY DEFINER) mirroring
    `get_my_inbox_permits()`: role-based on `get_my_effective_roles()` (so
    delegation already applies), MINUS forwarded-away PLUS forwarded-to-me if GP
    forward is in scope (see the optional GP-forward spec). Returns the
    gate_pass_ids (+ ordering field) the caller should act on.
R3. **Repoint the GP approver list** (`GatePassApprovals` / its hook) to the RPC,
    replacing the `status === 'pending_<role>'` filter. Keep the existing
    approve/reject/complete actions.
R4. **`gate_pass_active_approvers` powers the same downstream as WP** — i.e. it is
    the single source the GP inbox, the notifications spec, and (optionally) the
    forward spec read. No second router.
R5. **Custom-role correctness.** Resolution must work for custom roles with
    non-ASCII characters (e.g. `coordinator‑_client_relations`) — do not assume a
    fixed legacy role list.

## Edge cases
E1. Parallel GP approval steps (if any pass type has them) → multiple active rows,
    deduped in the inbox like WP.
E2. GP at a terminal/`completed` state → not in the inbox.
E3. A user holding the active role via delegation (effective roles) sees the GP;
    after the window ends, reverts.
E4. Status value whose `pending_<x>` suffix isn't a known role → resolve safely
    (no crash; treat as no active approver and log), so a malformed status can't
    break the inbox.

## Definition of done (verified against LIVE state)
- [ ] `gate_pass_active_approvers` exists and returns the correct current-step
      role for the 6 live GPs (all currently `pending_coordinator‑_client_relations`).
- [ ] `get_my_gate_pass_inbox()` exists, SECURITY DEFINER, EXECUTE to authenticated;
      a holder of the active role gets the GP; a non-holder does not (live test).
- [ ] `GatePassApprovals` uses the RPC; the `status==='pending_<role>'` filter is gone.
- [ ] A delegate of the active-role holder sees the GP (delegation parity).
- [ ] App builds; new DB objects verified present in LIVE DB.

## Deployment note (outside the loop)
DB view/RPC are migrations — apply to Supabase and verify live. Frontend deploys
via Lovable publish. Re-verify with a real approver after deploy.
