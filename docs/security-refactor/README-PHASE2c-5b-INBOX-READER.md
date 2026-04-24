# Phase 2c-5b — Inbox reader switch

**Scope:** replaces the two inbox reader hooks with queries against
the new `permit_active_approvers` view. Write paths (forward, rework,
approve, modify-workflow, permit creation) are unchanged — they still
populate the legacy `permit_status` enum in parallel. That enum stays
in place until Phase 2c-5c destructively removes it.

## What this PR does

### New view: `public.permit_active_approvers`

One migration file:
`supabase/migrations/20260425130000_phase2c5b_active_approvers_view.sql`

```sql
CREATE VIEW public.permit_active_approvers
WITH (security_invoker = true) AS
SELECT pa.*, wp.* FROM permit_approvals pa
JOIN work_permits wp ON wp.id = pa.permit_id
WHERE pa.status = 'pending'
  AND NOT COALESCE(wp.is_archived, false)
  AND wp.status NOT IN ('approved', 'rejected', 'cancelled', 'completed', 'draft')
  AND NOT EXISTS (                             -- suppress rows behind an
    SELECT 1 FROM permit_approvals pa_earlier  -- earlier unapproved step
    JOIN workflow_steps ws_earlier ON …
    WHERE pa_earlier.permit_id = pa.permit_id
      AND pa_earlier.status = 'pending'
      AND ws_earlier.step_order < ws_self.step_order
  );
```

This is the key improvement over reading `permit_pending_approvals`
directly: a permit's pending rows exist for ALL its required roles
as soon as the permit is submitted (Phase 2c-5a populates them all
up front). But the inbox should only surface a permit to PM when
PM is **currently** next — not when helpdesk is still pending.
The `NOT EXISTS` clause hides rows behind an earlier unapproved
required step.

`security_invoker = true` means the view respects RLS on the
underlying `permit_approvals` table. Existing RLS allows approvers
to see pending rows, so no new policies needed.

### Modified: `src/hooks/useWorkPermits.ts`

- `usePendingPermitsForApprover` — was 43 lines with a hardcoded 17-
  entry `statusMap`. Now 35 lines: query the view filtered by
  `role_name IN (userRoles)`, then a second hydrate query to pull
  the full permit rows + work_types. De-dupes permit ids (a user
  holding multiple roles that both pend on the same permit would
  otherwise see duplicates). Preserves SLA-deadline sort order.

- `usePendingPermitsCount` — was 43 lines, now 14. Single count
  query against the view. Accepts a small over-count if a user
  holds multiple roles that pend on the same permit, rather than
  incurring another round trip.

### Not changed

- `useForwardPermit`, `useReworkPermit`, `useProcessedPermitsForApprover`,
  `useSecureApprovePermit` — all still read/write the legacy
  `permit_status` enum. They're write paths that parallel-populate
  the enum during the migration window.
- No gate pass equivalent. Gate pass inbox uses a different surface
  and doesn't have the same multi-step-workflow problem.
- The enum itself is still on `work_permits`. Dropping it is Phase
  2c-5c, only after 2c-5b has been running cleanly.

## Validation

Against a Postgres 16 test DB seeded with 6 permits covering:
- New submitted permit — only the first step (helpdesk) shows active ✓
- Permit with helpdesk approved — PM shows active, PM+PD+IT+head_cr
  all exist as pending rows but only PM surfaces ✓
- Permit with a permit-specific override skipping a step — skipped
  step never appears ✓
- Archived permit — all rows suppressed ✓
- Draft permit (status='draft') — all rows suppressed ✓
- Approved permit (permit_status='approved') — all rows suppressed
  even if pending rows exist ✓

Cross-role filter tests:
- PM user filter returns 2 permits (both where it's PM's turn)
- Helpdesk filter returns 3 permits (all where helpdesk is the
  first-pending step)

## Known wart

A permit whose workflow template has no `step_order` on some steps
(all NULL) won't be suppressed by the `NOT EXISTS` clause — it could
show multiple roles as active simultaneously. Not a regression (legacy
code couldn't distinguish either) but worth knowing. In practice,
every workflow template in production has step_order populated.

## Known difference from legacy behavior

The legacy `permit_status` enum had a specific value for the initial
"submitted but not yet helpdesk-approved" state: `'submitted'`. My
new query treats that as "helpdesk is the active approver," which
is correct for workflows where helpdesk is step 1, but will behave
differently if any future workflow template doesn't start with
helpdesk.

If you have workflow templates that don't start with helpdesk, tell
me before merging — it might need a fix in the view.

## Deployment

Apply the migration first. Then redeploy the frontend bundle. No
edge function changes, no secrets, no new dependencies.

## Testing

1. Log in as an approver (e.g. PM). Approver inbox should show the
   same permits it showed before. Count badge should match.
2. Approve one permit → it should disappear from your inbox.
3. Submit a new permit → it should appear in helpdesk's inbox (or
   whoever is step 1 in the workflow).
4. Log in as a non-approver → inbox is empty.
5. Admin: no user-facing change on the inbox.

If the inbox shows DIFFERENT permits than before, that's drift
worth investigating — screenshot and flag it.

## Rollback

Revert the commit. The legacy `permit_status` enum is still being
written to in parallel, so the revert puts the app back on the
old reader path without data loss. Optionally drop the view:

```sql
DROP VIEW IF EXISTS public.permit_active_approvers;
```

## Next (Phase 2c-5c)

Destructive. Drops `permit_status` enum column, drops all per-role
legacy columns on `work_permits`, updates write paths to stop
writing them, removes PDF fallback paths. Only after 2c-5b has run
cleanly in production for a meaningful period and no drift reports.
