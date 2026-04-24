# Phase 2c-4 — Gate pass reader switch

**Scope narrowing:** what I originally labeled Phase 2c-4 was "Inbox
queries + gate pass detail + gate pass PDF." During investigation I
realized the inbox reads don't actually have the same problem the
detail page and PDF had. See "Why the inbox was dropped" below.

This PR is **gate-pass-only** — mirrors Phase 2c-2b (detail page) and
Phase 2c-3 (PDF generator) for gate passes. The inbox / permit_status
enum work becomes a new Phase 2c-5, and what I was going to call 2c-5
(drop legacy columns) is now 2c-6.

## What changed

### New files

- `src/hooks/useGatePassApprovals.ts` — React-Query hook mirroring
  `usePermitApprovals`. Joins `workflow_steps` for sort order. Exports
  `cctvConfirmed(approval)` and `materialAction(approval)` helpers
  because those two bits live in `gate_pass_approvals.extra` JSONB
  (security role sets cctv_confirmed, store_manager sets
  material_action).

- `src/components/GatePassApprovalProgress.tsx` — workflow-aware view
  mirroring `PermitApprovalProgress`. Takes `expectedRoles` as a prop
  rather than fetching a workflow template itself, because the gate
  pass role list is already computed by `GatePassDetail` from either
  the effective workflow or a static default that branches on
  `has_high_value_asset`. Renders each expected role with its actual
  approval row if one exists, or a pending/upcoming placeholder
  otherwise. CCTV verification badge and material_action direction
  both appear inline on the relevant role rows.

### `src/pages/GatePassDetail.tsx`

- Replaced the old 'Workflow Progress' card (hardcoded pill timeline
  reading `gp[${role}_date]`) with `<GatePassApprovalProgress>`.
- Removed the separate 'Approval Signatures' card entirely — the new
  progress component shows signatures, dates, approver names, and
  comments inline on each approval row.
- Removed the unused `statusTimeline` construction.
- `useTranslation()` wired up; the card title goes through i18n.

### `supabase/functions/generate-gate-pass-pdf/index.ts`

- Replaced the 3-entry hardcoded `sigBlocks` array (Store Manager /
  Finance / Security, each reading 4 columns off `gate_passes`) with
  a single query against `gate_pass_approvals`. Block titles and
  render order preserved via local maps (`ROLE_BLOCK_TITLES`,
  `ROLE_RENDER_ORDER`).
- Added a fallback that reads legacy columns if `gate_pass_approvals`
  returns zero rows, so pre-Phase-2b passes still render.
- Downstream rendering (box drawing, signature embedding, comment
  wrapping) operates on the same `{title, name, date, comments,
  signature}` shape — no layout changes.

### i18n

New keys `gatePasses.approvalProgress.*` (title, stepCount, submitted,
awaitingApproval, upcoming) added to both `en.json` and `ar.json`
with inline Arabic translations.

## Why the inbox was dropped from 2c-4

The inbox hooks in `useWorkPermits.ts` (`usePendingPermitsForApprover`,
`usePendingPermitsCount`) don't read per-role approval columns. They
filter on a single `permit_status` enum column:

    .in('status', ['pending_pm', 'pending_head_cr', ...])

The 'add-a-new-role means edit 9 files' pain this whole phase was
designed to fix doesn't exist there. Replacing it is still useful,
but it's a different problem — it means replacing the
`permit_status` enum itself, which touches `useForwardPermit`,
`useReworkPermit`, the approval edge function, `modify-permit-
workflow`, and the initial status set during permit creation.

That's the biggest single change in the whole 2c series, not the
smallest. Bundling it into 2c-4 would have made this PR hard to
review and would have delayed the clean gate-pass reader swap that's
actually the same shape as 2c-2b / 2c-3. So I split it out.

**New sequencing:**
- **2c-4 (this PR):** gate pass detail + gate pass PDF
- **2c-5 (next):** replace the `permit_status` enum — inbox,
  pending count, forward, rework, create, approval edge function,
  modify-workflow
- **2c-6 (terminal):** drop all legacy per-role columns + remove the
  fallback paths in PDF generators. Only after 2c-5 has been running
  cleanly in production.

## Deployment

1. Pull branch.
2. Rebuild frontend bundle.
3. Redeploy the `generate-gate-pass-pdf` edge function.
4. No migrations, no secrets, no new npm packages.

## Testing

On preview:

1. Open any gate pass detail page. The 'Workflow Progress' card now
   shows the new component — each expected role as a row with status
   chip, approver name, timestamp, signature thumbnail, auth method
   icon. CCTV-verified badge should appear on the security row where
   applicable. Material direction (in/out) should appear on the
   store_manager row.
2. Confirm the separate 'Approval Signatures' card no longer appears
   (its content has moved into the progress component).
3. Generate the PDF for a gate pass with approvals. Layout should be
   byte-identical to the previous PDF for that same pass.
4. Generate the PDF for an older pass (pre-Phase-2b if any) — the
   fallback path activates silently, PDF still renders.
5. Switch to Arabic. Labels translate, layout flips RTL, timestamps
   render left-to-right inside Arabic prose.

## Rollback

Revert the commit. No data migration required — legacy columns are
still populated by Phase 2b dual-write.
