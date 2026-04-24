# Phase 2c-1 — Approvals read scaffold

**Scope:** tiny. Adds one hook and one component that read from the
new `permit_approvals` table. Nothing in the existing app uses them
yet — this is the scaffold that Phase 2c-2 will mount on the permit
detail page.

Shipping this as its own PR so I can validate the data shape and the
visual rendering in production before anything depends on it.

## Why this phase exists

Phase 2b has been dual-writing every approval into `permit_approvals`
and `gate_pass_approvals` for a while now. Those tables are silently
accumulating rows but no reader queries them — legacy per-role columns
on `work_permits` / `gate_passes` are still the source of truth, and
every reader (permit detail, inbox, PDF, email, admin views) reads
those columns directly with code like:

```ts
permit.helpdesk_status, permit.pm_status, permit.head_cr_status, ...
permit.helpdesk_approver_name, permit.pm_approver_name, ...
```

This is why adding a new approver role still requires editing ~8
files. The whole point of Phase 2 was to replace that with one table.

Phase 2c-1 through 2c-5 switch readers over in small steps so any
drift or bug is caught before it spreads.

## What this phase adds

Two files. No deletions.

### `src/hooks/usePermitApprovals.ts`

React-Query hook returning an ordered array of approvals for a given
permit.

- Types: `PermitApproval`, `PermitApprovalStatus`, `PermitApprovalAuthMethod`.
- Joins `workflow_steps` so rows sort by workflow step order when
  available, falling back to role-name alphabetical so the UI never
  jitters. Backfilled rows (which lack a `workflow_step_id`) still
  render in a stable order.
- `currentPendingRole(approvals)` helper derives the "who are we
  waiting on?" string from the data, so callers don't recompute.
- `legacyStatusColumnFor(roleName)` utility for drift-detection code
  in future phases.

### `src/components/PermitApprovalsList.tsx`

Drop-in display component that renders the full approval history for
a permit. Uses the new hook. Renders:

- One card per approval row.
- Status chip (pending / approved / rejected / skipped) with semantic
  tone.
- Approver name + timestamp.
- Auth method icon (fingerprint or key) for approved rows.
- Signature thumbnail when present.
- Inline comments.
- Skeleton loading state, empty state, error state all handled.

Accepts an optional `roleLabel` function so the caller can map raw
role keys like `head_cr` to display labels (or translated labels).
Falls back to a snake_case → Title Case default so nothing ever
renders as raw keys.

## What this phase does NOT do

- **No reader is switched.** `PermitDetail.tsx` still reads
  `permit.helpdesk_status` etc. from the legacy columns. That swap
  happens in 2c-2.
- **No legacy code is deleted.**
- **No schema changes.**

Pure additive. Safe to revert by just removing the two files.

## i18n

`permits.approvals.listLabel`, `permits.approvals.empty`, and
`permits.approvals.skipped` added to both `en.json` and `ar.json`
with inline Arabic translations.

## Validation

The hook's join query was tested against a Postgres 16 DB with Phase
2b backfill seeded: returns 3 rows for the seeded permit, sorted
correctly, status column is authoritative, approver_name and
approver_email come through from backfill, `auth_method` is `password`
for the historical rows.

## Deployment

Pull branch, rebuild frontend. No migrations, no edge functions, no
secrets, no new deps.

## Next phase

**Phase 2c-2:** mount `<PermitApprovalsList>` on `PermitDetail.tsx`
in parallel with the existing column-driven rendering. Both display
at the same time so I can compare. Once I'm satisfied they match,
remove the legacy rendering.
