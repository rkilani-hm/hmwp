# Spec: Gate Passes on the dashboard + the unified approver inbox (parity with WP)

## Objective
Gate Passes must appear in the user's dashboard and approver inbox the same way
Work Permits do — side by side, same components/treatment — instead of living in
separate `/gate-passes` silo pages. Forms and workflows stay GP-specific; the
surfaces (dashboard cards, inbox list, counts) become shared.

## Findings from live investigation (authoritative basis)
- `Dashboard.tsx` has ZERO gate-pass references — GPs never appear on the main
  dashboard. GP has a separate `GatePassDashboard` (`/gate-passes`).
- The approver inbox `ApproverInbox` is WP-only (`usePendingPermitsForApprover`).
  GP approvers use a separate `GatePassApprovals` page (`/gate-passes/approvals`).
- Routes (`Index.tsx` 122–125): `gate-passes`, `gate-passes/new`,
  `gate-passes/:id`, `gate-passes/approvals` are all GP-only screens.
- WP pending count: `usePendingPermitsCount` (badge). No GP equivalent surfaced on
  the main dashboard/nav.

## Dependency
Builds on `gate-pass-active-approver-resolution.md` (the `get_my_gate_pass_inbox()`
RPC). Do that spec first so the dashboard/inbox have a WP-style source to read.

## Requirements
R1. **Main dashboard shows GPs.** The user's dashboard surfaces pending GPs
    (for approvers: GPs awaiting their action; for requesters: their GPs) using
    the same card/stat treatment as WP. Either extend `Dashboard.tsx` to include a
    GP section, or render WPs + GPs in one unified list with a type badge.
R2. **Unified approver inbox.** Pending GPs appear in `ApproverInbox` alongside WPs
    (driven by `get_my_gate_pass_inbox()` + `get_my_inbox_permits()`), OR
    `GatePassApprovals` is refactored to reuse the same inbox components/layout so
    the two are visually and behaviorally identical. Clicking a GP opens
    `GatePassDetail` (GP form), clicking a WP opens the permit detail.
R3. **Counts/badges include GPs.** Any "pending approvals" count/badge reflects
    WP + GP combined (or shows both), consistent with how WP counts work today.
R4. **Type-aware routing preserved.** A GP row routes to the GP detail/approval
    flow (GP form + GP workflow); a WP row to the WP flow. Only the
    form/workflow differ — the surfaces are shared.
R5. **No regression to existing GP pages.** `/gate-passes*` continue to work (or
    are intentionally consolidated); requesters still create/track GPs.
R6. **Tenant vs internal treatment matches WP** (respect the same dashboard/role
    gating already applied to WP, including the internal-work-type / tenant rules
    where analogous).

## Edge cases
E1. A user with both pending WPs and GPs sees both in one place, sorted sensibly
    (e.g. by SLA/urgency then date), de-duplicated per item.
E2. An approver who only handles GPs (e.g. store_manager/security roles not in any
    WP workflow) still gets a populated inbox/dashboard.
E3. Empty states: clear "nothing pending" covering both types.
E4. Mobile layout parity (the WP inbox is mobile-tuned; GP rows must match).

## Definition of done (verified against LIVE state + UI)
- [ ] As an approver with a pending GP: it appears on the main dashboard and in
      the unified inbox, styled like a WP, with a GP type indicator.
- [ ] Clicking the GP opens the GP detail/approval flow.
- [ ] Pending count/badge includes the GP.
- [ ] As a requester: my GPs show on my dashboard like my WPs.
- [ ] No regression: existing `/gate-passes` create/track flows still work.
- [ ] App builds; no type errors.

## Deployment note (outside the loop)
Primarily frontend (deploys via Lovable publish); any supporting RPC is a DB
migration applied to Supabase. Re-verify with a real approver + requester after deploy.
