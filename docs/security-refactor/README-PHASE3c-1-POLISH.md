# Phase 3c-1 — Polish sweep

**Scope:** small, broad, low-risk. Finishes the brand-token work from
Phase 3a by hunting down hardcoded Tailwind colors that survived, and
upgrades two UX primitives (skeletons and empty states) so list pages
feel more responsive on mobile.

PermitFormWizard split and other larger UX items are intentionally
deferred to a separate PR (Phase 3c-2) so the blast radius of each
change stays small.

## Files changed

### New UI primitives
- `src/components/ui/PermitListSkeleton.tsx` — placeholder card shape
  for list-loading states. Approximates the real permit card so the
  page doesn't reflow when data arrives.
- `src/components/ui/EmptyState.tsx` — card-shaped empty state with an
  icon, title, optional description, optional action. Replaces the
  ad-hoc "no results" block previously inlined in ApproverInbox and
  reused across future list pages.

### Color token sweep (7 pages, ~60 color-class replacements)

All hardcoded Tailwind color scales replaced with brand tokens:

- `green-*` → `success` token
- `red-*` → `destructive` token
- `blue-*` → `info` token
- `amber-*` / `yellow-*` → `warning` token
- `gray-*` → `muted` / `muted-foreground` / `border` depending on role

Files touched:
- `src/pages/ApproverInbox.tsx` — plus URGENT / SLA BREACHED / empty
  state / loading skeleton / title all migrated to i18n.
- `src/pages/ApproverOutbox.tsx` — the approved/rejected/forwarded/
  rework icon + chip map.
- `src/pages/InstallApp.tsx` — "App Installed!" success card + four
  checklist bullets.
- `src/pages/PublicPermitRequest.tsx` — submission success card +
  amber warning block.
- `src/pages/PublicPermitStatus.tsx` — permit scan status cards
  (APPROVED / REJECTED / CLOSED / PENDING / EXPIRED / Not Valid Yet /
  Currently Valid) plus camera error banner and "Not Found" card.
- `src/pages/PublicScanVerify.tsx` — same palette as above for the
  public scan page.
- `src/pages/ScanVerify.tsx` — authenticated scan page equivalent.

After this sweep, the only surviving hardcoded Tailwind color scales
in the repo are in admin pages (UserActivityLogs, WorkflowBuilder),
one utility component (PasswordStrengthIndicator's 5-level strength
bar), and minor touches in GatePassPrintView / toast. Those are lower-
traffic surfaces and can wait.

### i18n additions

`approverInbox.emptyTitle` and `approverInbox.emptyHint` added to both
`en.json` and `ar.json`. Arabic translated inline.

## What a user will see

- **Approver inbox**: loading state replaced with skeleton cards
  (roughly the shape of a permit card) instead of a centered spinner.
  Empty state uses the new shared component. The URGENT and SLA
  BREACHED badges are translated.
- **Scan / status pages**: success green is now the brand success
  token — a slightly different shade from the raw Tailwind green-600,
  and more coherent with the rest of the app.
- **Approver outbox**: icon chips for approved / rejected / forwarded
  / rework use the semantic tokens and stay consistent if the success/
  destructive/info/warning tokens are retuned later.
- **Install success banner + submission success card**: same token
  swap, same visual family as everything else.

No behavior changes. No API changes. No migrations. No new deps.

## Deployment

1. Pull branch.
2. Build and deploy frontend bundle.

## Testing

Two quick spot-checks on a phone:

1. Approver inbox: clear any pending approvals (or filter to none) —
   the empty state uses the new card. Reload the page — the first
   100-200ms shows skeleton cards instead of a spinner.
2. Scan the QR code of any permit — status card uses the brand
   success-token green (a touch warmer than before), not Tailwind's
   raw green-600.

## Known leftovers (for a later phase)

- `src/pages/admin/UserActivityLogs.tsx`, `WorkflowBuilder.tsx` —
  admin surfaces with their own color conventions; lower priority.
- `src/components/ui/PasswordStrengthIndicator.tsx` — 5-level strength
  meter uses bg-red-500 / amber / green. Could use destructive /
  warning / success, but the levels are ordinal not semantic so the
  mapping isn't 1-to-1. Worth a dedicated look.
- `src/pages/UserManuals.tsx` — docs page, not user-facing.
