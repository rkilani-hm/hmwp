# Phase 2c-3 — PDF generator reads from permit_approvals

**Scope:** swap one reader inside `generate-permit-pdf`. The 13-row
hardcoded approvals array (one row per approver role, each reading
five columns off `work_permits`) is replaced with a single query
against `permit_approvals`.

## What changed

### `supabase/functions/generate-permit-pdf/index.ts`

Before:
```ts
const approvals = [
  { name: 'Customer Service', roleKey: 'customer_service',
    status: permit.customer_service_status,
    approver: permit.customer_service_approver_name,
    date: permit.customer_service_date,
    signature: permit.customer_service_signature,
    comments: permit.customer_service_comments },
  { name: 'CR Coordinator', roleKey: 'cr_coordinator',
    status: permit.cr_coordinator_status, ... },
  // ... 11 more rows, all reading 5 columns each from the permit row ...
];
const activeApprovals = approvals.filter(
  (a) => a.status === 'approved' || a.status === 'rejected',
);
```

After:
```ts
const { data: approvalRows } = await supabaseAdmin
  .from('permit_approvals')
  .select('role_name, status, approver_name, approved_at, signature, comments')
  .eq('permit_id', permitId);

let approvals = approvalRows.map(r => ({
  name: ROLE_DISPLAY_NAMES[r.role_name] ?? r.role_name,
  roleKey: r.role_name,
  status: r.status,
  approver: r.approver_name,
  date: r.approved_at,
  signature: r.signature,
  comments: r.comments,
}));
approvals.sort(byRenderOrder);    // preserves original PDF layout
const activeApprovals = approvals.filter(a => a.status === 'approved' || a.status === 'rejected');
```

Two small maps are kept local to this file:

- `ROLE_DISPLAY_NAMES` — maps role keys to the exact labels the old
  PDF used ("customer_service" → "Customer Service", "bdcr" → "BDCR",
  "fmsp_approval" → "FMSP Approval", etc.). 13 entries, matches the
  old hardcoded array 1:1.
- `ROLE_RENDER_ORDER` — preserves the original PDF layout order
  (client workflow roles first, then internal, then FMSP final).
  Sorted explicitly so row placement on the generated PDF is
  byte-identical for permits with identical approval data.

### Downstream rendering logic: unchanged

Everything past the approvals array — grid layout, status symbol,
signature embedding, audit-info lookup (`auditInfoByRole`), comment
wrapping — operates on the same `{name, roleKey, status, approver,
date, signature, comments}` shape. No other code in the PDF generator
reads per-role columns.

### Fallback for pre-Phase-2b permits

If `permit_approvals` returns zero rows, the code falls back to the
legacy per-role columns and builds the same shape from them. This
handles the rare case of a permit that existed before Phase 2b went
live and somehow never got reconciled (shouldn't happen, but better
to generate a valid PDF than crash). The fallback can be removed in
Phase 2c-5 once legacy columns are dropped — any remaining
unreconciled permit should be backfilled first.

## Not in this PR

- **Email function** (`send-email-notification`) doesn't read approval
  columns at all — it composes generic per-event messages from
  `permitNo` and event type. No reader switch needed there.
- **`useWorkPermits` inbox queries + gate pass detail** — Phase 2c-4.
- **Dropping legacy columns + replacing `permit_status` enum** —
  Phase 2c-5 after all readers are switched.

## Validation

Tested the exact query shape against a Postgres 16 test DB with Phase
2b backfill seeded — returns the expected rows for TEST-BF-001 with
all six columns populated.

PDF generation itself can only be fully validated by generating a
real PDF on preview. The risk surface is small: only the data fetch
changed; rendering logic is byte-identical.

## Testing

1. Generate the PDF for a permit with several approvals from preview.
   The layout should be byte-identical to the pre-change PDF (same
   cell order, same role labels, same content).
2. Compare the PDF against what the new PermitApprovalProgress panel
   on `PermitDetail` shows — same permit, same data should appear in
   both.
3. Generate a PDF for a permit that predates Phase 2b (an old
   permit).  The fallback path should activate; PDF still renders.

## Deployment

Redeploy the `generate-permit-pdf` edge function. No migration, no
other functions, no frontend change, no secrets.

## Rollback

Revert the commit. The fallback path means there's no data required
to roll back — the old per-role columns are still populated by
Phase 2b dual-write.
