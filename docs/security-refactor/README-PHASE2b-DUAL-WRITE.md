# Phase 2b — Dual-write + backfill

**Status:** schema-only for now (dual-write in edge functions, backfill
migration, reconcile helpers). Legacy per-role columns on `work_permits`
and `gate_passes` remain the source of truth. No reader switch yet.

## What this phase does

1. Every approval that passes through `verify-signature-approval` or
   `verify-gate-pass-approval` is now **mirrored into** `permit_approvals`
   or `gate_pass_approvals` respectively. The mirror write is non-blocking
   — if it fails, the primary approval still succeeds and the failure is
   logged. This prevents dual-write from becoming a new failure surface.

2. A one-time backfill populates the new tables from existing rows in the
   legacy columns. The backfill is idempotent (safe to rerun).

3. Two reconcile functions are exposed for drift repair:
   - `SELECT public.reconcile_permit_approvals(permit_id);`
   - `SELECT public.reconcile_gate_pass_approvals(gate_pass_id);`

## What this phase does NOT do

- Does not change any reader. Inbox, detail pages, PDFs, emails still
  read from the legacy columns.
- Does not drop the legacy columns.
- Does not change the `permit_status` enum.

The reader switch happens in **Phase 2c** (separate PR) after dual-write
has been running in production for long enough to confirm drift stays at
zero under real traffic. Only then is it safe to drop the legacy columns.

## Deployment

Order matters:

1. Apply the migration:
   `supabase/migrations/20260424110000_phase2b_backfill_approvals.sql`.
   Idempotent; safe to retry.

2. Deploy the two updated edge functions:
   - `verify-signature-approval`
   - `verify-gate-pass-approval`

   (Both now import `_shared/approvals-dualwrite.ts`.)

Deploying the migration before the edge functions is fine. Deploying the
edge functions before the migration means the mirror upserts will fail
silently until the migration lands — no user-visible effect, but the new
tables won't be populated during that window.

## Verification queries

After deployment, run a test approval. Within a few seconds both of these
should return 1:

```sql
SELECT COUNT(*) FROM public.permit_approvals
  WHERE permit_id = '<test-permit-id>' AND role_name = '<role>';

-- And the legacy column should match:
SELECT helpdesk_status FROM public.work_permits
  WHERE id = '<test-permit-id>';
```

## Drift audit

To find permits where the legacy columns have an approval that didn't
make it into the new table:

```sql
-- Permits where legacy says approved but new table has nothing
SELECT wp.permit_no, 'helpdesk' AS role
FROM public.work_permits wp
WHERE wp.helpdesk_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.permit_approvals pa
    WHERE pa.permit_id = wp.id AND pa.role_name = 'helpdesk'
  );
```

Run `SELECT public.reconcile_permit_approvals(permit_id)` for each result
to repair.

## Back-out

Dual-write is non-blocking. If anything goes wrong with the mirror, the
primary approval path continues working. To fully revert:

1. Revert the two edge functions.
2. Leave the tables in place — no reader depends on them yet.
3. `DROP FUNCTION public.reconcile_permit_approvals(uuid);`
4. `DROP FUNCTION public.reconcile_gate_pass_approvals(uuid);`
