# Phase 2c-2 — PermitDetail A/B verification panel

**Scope:** 26-line change to one file. Mounts `<PermitApprovalsList>`
(from Phase 2c-1) on `PermitDetail.tsx` as an **admin-only** A/B
verification panel below the existing legacy approval progress card.

## What users see

### Admins
On a permit detail page, below the existing **"Approval Progress"**
card, a second card titled:

> **Approvals (new data source — verification only)**
> Read from `permit_approvals`. Should match the panel above.

This second card renders the same approval history, but derived from
the new `permit_approvals` table instead of the legacy per-role
columns. Both cards should show identical information for the same
permit.

### Non-admins
Nothing changes. The new card is gated by the existing `isAdmin` check
already used elsewhere on the page.

## Why A/B, not replace

Phase 2b dual-write has been populating `permit_approvals` for a while.
The data **should** be correct, but:

- Backfill ran once, after some historical permits already existed.
  Edge cases (deleted columns, null approver_emails, weird legacy
  status values) might have slipped through.
- Dual-write is non-blocking: if an upsert fails silently for any row,
  the legacy column succeeds but the new table misses that approval.

Mounting both panels side-by-side lets admins inspect real permits in
production and flag any mismatch. The blast radius of swapping reads
is zero until we remove the legacy panel — you see the new data but
nothing depends on it.

## How to verify

As admin, open permit detail pages (especially ones with complex
approval histories) and scan:

- Are the same roles listed in both panels?
- Do the statuses (approved/rejected/pending) match?
- Do the approver names and timestamps match?

Report any mismatch. Common non-issues worth knowing:

- **Order may differ.** The legacy panel follows a hardcoded order.
  The new one sorts by `workflow_steps.step_order` (or role_name
  fallback). If the orders differ but the set of rows is identical,
  that's fine and is in fact more correct.
- **The new card may show fewer rows for old permits.** Roles that
  have no activity (never approved or rejected, just pending) may not
  have a row yet in `permit_approvals` for permits created before
  Phase 2b went live. The legacy panel shows them as "waiting"
  slots; the new panel shows only the approvals that actually happened.
  Phase 2c-3 will change the semantic to include pending slots too.

## What Phase 2c-2b will do

Once we're confident the new table matches — typically after a week or
so of admins reviewing permits and no drift reports — Phase 2c-2b:

1. Remove the legacy `UnifiedWorkflowProgress` card.
2. Promote `<PermitApprovalsList>` from the admin-only verification
   panel to the single primary approval display.
3. Rename the card title from "Approvals (new data source…)" to
   "Approval Progress" (or Arabic equivalent).

That PR is deliberately separate — different risk profile.

## Deployment

Pull branch, rebuild frontend. No migrations, no edge functions, no
secrets, no new deps.

No testing required beyond "admin sees two panels, non-admin sees one",
which a single smoke test on preview confirms.
