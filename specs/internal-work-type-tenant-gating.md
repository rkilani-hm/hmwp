# Spec: Internal-workflow work types restricted to internal staff (not tenants)

## Objective
Any Work Permit work type whose workflow is INTERNAL must not be requestable or
selectable by tenant users — only internal employees may request internal-type
WPs (and GPs, per the internal/tenant rule). Tenants only get the work types
meant for them. Enforce in BOTH the UI (hidden from selection) and the backend
(rejected on submission) so it cannot be bypassed.

## Findings from live investigation (authoritative basis)
- An internal marker ALREADY EXISTS at the workflow level:
  `workflow_templates.workflow_type` is text with live values
  `client`, `internal`, `gate_pass`. Internal templates exist (e.g.
  `FM MEP WORKS (Internal)`, `FM CIVIL WORKS (Internal)`).
- Work types inherit it via `work_types.workflow_template_id` →
  `workflow_templates.workflow_type`. So a work type is "internal" iff its
  template's `workflow_type = 'internal'`.
- `work_permits.is_internal` (boolean, default false) is effectively DEAD: set on
  0 of 17 permits, referenced only once (carried forward on rework). It is NOT
  derived from `workflow_type`. Do not rely on it as the source of truth.
- Gate passes have NO internal concept: `pass_category` ∈
  {detailed_material_pass, generic_delivery_permit}; workflow_type='gate_pass'.

## Decisions needed / assumptions (confirm)
- [ASSUMPTION — confirm] "Internal" for WORK PERMITS = the work type's
  `workflow_templates.workflow_type = 'internal'`. Use this as the predicate; do
  NOT add a new column for WPs.
- [DECISION NEEDED] GATE PASSES: there is currently no internal marker. Options:
  (a) treat ALL gate passes as available to tenants (no GP gating) — simplest;
  (b) add an internal flag to gate-pass types/workflows and gate those from
  tenants. The original requirement said "WPs and GPs"; since no GP internal
  marker exists, building GP gating REQUIRES adding one. Confirm whether GP
  internal gating is in scope now or deferred.
- [DECISION NEEDED] Should the existing dead `work_permits.is_internal` be
  (a) derived/populated from `workflow_type` for consistency, or (b) retired?
  Recommended: populate it server-side from the work type's workflow_type at
  create time so downstream reporting has a reliable per-permit flag — but the
  ACCESS decision must key on `workflow_type`, not on this boolean.

## Requirements

R1. **Hide internal work types from tenant submitters (UI).** In the new-permit
    work-type selection, a tenant-only user must not see or be able to select any
    work type whose effective `workflow_templates.workflow_type = 'internal'`.
    Internal employees see all applicable types.

R2. **Reject internal submissions by tenants (backend).** Submitting a WP of an
    internal work type as a tenant must be rejected server-side (RLS policy
    and/or the create RPC/edge path), independent of the UI — so it cannot be
    bypassed by a crafted request. Use the authoritative DB tenant check
    (`is_tenant_user`) and the work type → workflow_type predicate.

R3. **Tenant visibility of internal permits.** Tenants must not see internal-type
    permits in any list/dashboard (they only see their own). Confirm existing
    tenant RLS on `work_permits` already restricts tenants to their own rows; if
    internal permits could ever be tenant-owned (they should not be able to
    create them), ensure none leak. This requirement is about not exposing
    internal-type permits to tenants — verify against existing RLS.

R4. **Gate Pass handling per the confirmed decision.** If GP internal gating is
    in scope: add the minimal internal marker for gate-pass types/workflows and
    apply the same UI-hide + backend-reject rule. If deferred: explicitly state
    GPs remain available to tenants and no GP change is made in this spec.

R5. **(Optional, per decision) Populate `work_permits.is_internal`** from the
    work type's workflow_type at creation, for reliable reporting — WITHOUT
    making access decisions depend on it.

R6. **No regression for internal staff.** Internal employees can still select and
    submit internal AND client work types as before.

## Edge cases
E1. A user holding BOTH tenant and a non-tenant role: treat as internal (per
    `is_non_tenant_staff` = holds >=1 non-tenant role). Confirm this matches
    intent — a mixed-role user should be allowed internal types.
E2. Work type with NULL/missing workflow_template_id, or template with NULL
    workflow_type: define safe default (recommended: treat as NON-internal /
    client-available unless explicitly internal, to avoid accidentally hiding
    everything; but never expose an internal one by mistake — fail closed for
    tenants on ambiguity).
E3. Rework/resubmit of an internal permit by an internal user still works.
E4. Existing 17 permits: none have is_internal set; backfilling (if R5 chosen)
    must derive correctly from their work type's workflow_type and not corrupt
    historical rows.

## Definition of done (verified against LIVE state + a real test)
- [ ] As a tenant: internal work types do NOT appear in the new-permit type
      selection; client types do.
- [ ] As a tenant: a forced/crafted submission of an internal work type is
      REJECTED server-side (verify via the RLS policy / RPC, not just UI).
- [ ] As an internal employee: internal and client types both selectable and
      submittable.
- [ ] Tenants see only their own permits; no internal-type permit is visible to
      a tenant.
- [ ] GP behavior matches the confirmed decision (gated with new marker, or
      explicitly unchanged).
- [ ] If R5 chosen: new internal permits get is_internal=true derived from
      workflow_type; historical rows backfilled correctly; access logic does NOT
      depend on the boolean.
- [ ] App builds; any DB policy/function/column change verified present in LIVE
      DB; no regression to internal submitters.

## Deployment note (outside the loop)
RLS/policy/column changes are DB migrations — apply to Supabase directly and
verify live. Frontend (type-list filtering) deploys via Lovable publish. A repo
merge alone deploys nothing. Run a real tenant + real internal submission test
after deploy.
