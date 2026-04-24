# Phase 2c-5a — Populate pending rows in permit_approvals

**Scope:** migration-only, additive. No frontend changes, no edge
function changes, no dropped columns. Nothing that exists today
changes behavior. This PR is pure infrastructure for the inbox
reader switch in 2c-5b.

## Why

`permit_approvals` has been dual-writing for weeks but only contains
rows for approvals that actually happened (`approved` / `rejected`).
There are no `pending` rows for permits waiting on their next
approver. This makes the `permit_pending_approvals` view (added in
Phase 2a) empty in practice, and it blocks flipping the inbox
readers to the new tables. You can't query "which permits need my
attention" from a table that has no representation of "this permit
needs attention."

## What this migration does

File: `supabase/migrations/20260425120000_phase2c5a_pending_approvals_backfill.sql`

### 1. New function: `public.ensure_permit_pending_approvals(uuid)`

Idempotent. Takes a permit id, walks the workflow template's steps,
applies the full requirement-priority chain the frontend uses, and
inserts a `pending` row in `permit_approvals` for every required
step that doesn't already have a row. Existing rows (pending,
approved, rejected, skipped) are never touched.

Requirement-priority chain (matches `UnifiedWorkflowProgress` and
the new `PermitApprovalProgress`):

1. `permit_workflow_overrides.is_required`
2. `work_type_step_config.is_required`
3. `workflow_steps.is_required_default`
4. Legacy `work_types.requires_<role_name>` (dynamic JSON probe)
5. Default `true`

Early returns:
- Permit doesn't exist → 0
- Permit is archived → 0 (dead, never surfaced)
- Permit is `draft` or status null → 0 (workflow hasn't started)
- Work type has no workflow template → 0 (legacy edge case)

### 2. Trigger on `work_permits`

Fires `AFTER INSERT OR UPDATE OF status`, gated by `WHEN (NEW.status
IS DISTINCT FROM 'draft' AND NEW.status IS NOT NULL)`. Every new
submitted permit automatically gets its pending rows. A draft->submitted
transition also triggers it. Drafts themselves don't fire.

### 3. Backfill loop

Walks every active, non-draft permit and calls the ensure function.
Idempotent — re-running produces zero additional inserts.

## Dual-write semantics

**Unchanged.** The existing dual-write helper in
`supabase/functions/_shared/approvals-dualwrite.ts` uses
`INSERT ... ON CONFLICT (permit_id, role_name) DO UPDATE ...`. When a
pending row exists (which it now will, for all active permits), the
upsert updates it in place to `approved` / `rejected` with the
approver data. When no pending row exists (pre-Phase-2b historical
records), it inserts fresh. Both paths still work.

## Validation

Tested against Postgres 16 with realistic seed data:

- 3 active permits with different configurations (various work types,
  partial approval history, permit-specific overrides, work-type
  step config overrides)
- 1 archived permit (skipped correctly)
- Requirement-priority chain produces the right step set for each
- Idempotency: re-running inserts zero rows
- Trigger: INSERT-time pending population
- Trigger: draft→submitted transition pending population
- Dual-write upsert correctly transitions pending→approved in place
- `permit_pending_approvals` view returns the expected rows filtered
  by role_name

## Not in this PR

- **Inbox readers still query `work_permits.status`** — that swap is
  Phase 2c-5b.
- **`permit_status` enum still populated by forward / rework / approve
  hooks** — not removed until 2c-5c (or later, depending on drift).
- **Gate passes** — no equivalent migration for gate_pass_approvals
  yet. Deferred. The gate pass inbox / workflow semantics are simpler
  (fixed role set, no workflow templates), so if we need to do it,
  it'll be a smaller follow-up.

## Deployment

Apply migration. No frontend change, no edge function redeploy, no
secrets. The migration is idempotent, so re-running on the same DB
is safe.

## Rollback

```sql
DROP TRIGGER IF EXISTS work_permits_ensure_pending ON public.work_permits;
DROP FUNCTION IF EXISTS public._trg_permit_ensure_pending();
DROP FUNCTION IF EXISTS public.ensure_permit_pending_approvals(uuid);

-- Optional: delete the inserted pending rows (legacy read path still works)
DELETE FROM public.permit_approvals WHERE status = 'pending';
```

The app continues to function normally without pending rows — nothing
reads them yet.
