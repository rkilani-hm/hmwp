# Phase 2c-2b — Promote new approval panel to primary on PermitDetail

**Scope:** reader switch on the permit detail page. Removes the legacy
`UnifiedWorkflowProgress` component (which read from hardcoded per-role
columns) and replaces it with a new `PermitApprovalProgress` component
that reads from the `permit_approvals` table populated by Phase 2b
dual-write. Every user — admin and non-admin alike — now sees the new
data source.

## What changed

### New file: `src/components/PermitApprovalProgress.tsx`

Workflow-aware progress view. Replicates the important behavior of
the legacy panel against the new data source:

- Loads the workflow template's steps (via the same query the legacy
  panel used — `work_types` → `workflow_templates` → `workflow_steps`).
- Applies the same requirement-priority chain: permit-specific
  overrides → work-type step config → step defaults → legacy
  `requires_<role>` fallback.
- For each required step, shows the actual approval row from the new
  table if one exists; otherwise renders a pending or upcoming
  placeholder.
- Header with progress bar and "N of M steps completed".
- Auth method icon (fingerprint / key) on approved rows.
- Signature thumbnail when present.
- Skeleton loading, empty state, error state all handled.

### Removed: `src/components/ui/UnifiedWorkflowProgress.tsx` (610 lines)

No longer imported anywhere after this change. Its behavior is covered
by the new component.

### Removed from `PermitDetail.tsx`

- The `UnifiedWorkflowProgress` import.
- The `unifiedPermit: UnifiedPermitData` construction block — ~75 lines
  of field-by-field mapping from the legacy column layout that was
  only consumed by the removed panel.
- The admin-only Phase 2c-2 A/B verification card — its purpose was
  to catch drift before this swap; it's done its job.
- The `PermitApprovalsList` import — also leftover from 2c-2; the
  component file remains for potential future use.

### i18n

New keys in both `en.json` and `ar.json`:

- `permits.approvalProgress.title` — "Approval progress"
- `permits.approvalProgress.stepCount` — "{{completed}} of {{total}}
  steps completed"
- `permits.approvalProgress.submitted` — "Submitted"
- `permits.approvalProgress.awaitingApproval` — "Awaiting approval"
- `permits.approvalProgress.upcoming` — "Upcoming"

## What's intentionally dropped

The legacy panel had an "Estimated time to completion" widget driven
by `useAverageApprovalTimes`. I didn't port it. Reasoning: fancy
feature, never load-bearing, can be re-added as a standalone patch if
users miss it. Keeping this PR focused on the reader switch.

## Deployment

1. Pull branch, rebuild frontend.
2. No migrations, no edge functions, no secrets, no new deps.

## Testing

1. Open any permit detail page as any user (admin or not). You should
   see a single "Approval Progress" card in the sidebar.
2. For a permit with partial approvals: rows for approved steps show
   approver name, timestamp, signature; rows for pending/upcoming
   steps show a gray circle.
3. Progress bar reflects completed/total.
4. Switch language to Arabic in Settings → reopen the permit — labels
   translate, layout flips RTL, step count phrase reads correctly.

## Rollback

Revert this commit. The new component file is harmless to keep in the
revert (no one imports it). You'd need to restore
`UnifiedWorkflowProgress.tsx` from git history and re-add the
`unifiedPermit` construction block in `PermitDetail.tsx`.

## Next in the 2c series

- **2c-3:** PDF generator + email template switch to `permit_approvals`
- **2c-4:** Inbox + gate pass reader switch
- **2c-5:** Drop legacy per-role columns + replace `permit_status` enum
