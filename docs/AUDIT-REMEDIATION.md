# Audit Remediation — Status & Decisions

Record of the full system audit (security / design / process) and how each item
was resolved. Items that would risk functionality at go-live are **documented,
not implemented** — see the rationale per item.

## Done (shipped + verified)

| Item | Area | Outcome |
|---|---|---|
| S1 | Security | **Gate-pass approval authorization bypass fixed.** `authorize_gate_pass_approval` RPC (caller must hold the role + it must be the current step) gates `verify-gate-pass-approval`. Applied live + validated. |
| S2 | Security | `extract-id-document` open AI-proxy bounded with per-IP rate limit + image-size cap. |
| D1 | Design | WP/GP twin components/hooks collapsed into shared `entity`-parameterized primitives (`EntityComments`, `EntityActivityLog`, `useEntityComments`, `useEntityApprovals`). ~319 lines removed. |
| D2 | Design | Shared `ApprovalProgress` presentation extracted (`ApprovalProgressShared`). ~299 lines removed. |
| D4 | Design | 1,849-line `useWorkPermits` god-hook split into a concern module. |
| P1 | Process | CI (`tsc` + lint + build + `deno check`) added as the pre-merge gate. |
| P3 | Process | Duplicate migration timestamp fixed. |
| P6 | Process | `DEPLOYMENT.md` runbook (migrate→deploy→publish order, expand/contract, branch protection, rollback). |
| — | Design | Tenant accounts no longer show Department / Actor-type (internal-staff only) in the admin user dialog. |

DB baseline confirmed strong: RLS on every table, all `SECURITY DEFINER`
functions pin `search_path`, no over-permissive write policies.

## Deferred — documented, NOT changed at go-live (would risk functionality)

### D3 — Dual-write (legacy status columns ↔ `*_approvals` mirror)
**Decision for launch: keep the dual-write as-is; legacy per-role status columns
remain the source of truth, `*_approvals` is the read mirror.** It works today
and the system is live on it.
- **NOT done:** the destructive "drop the 16 legacy status columns" migration —
  it mutates live production data and must not run at go-live.
- **Post-launch plan (pick one):**
  - *Formalize:* schedule `reconcile_permit_approvals` / `reconcile_gate_pass_approvals`
    via `pg_cron` + add a drift-count alert. Low risk, no data migration.
  - *Finish:* make `*_approvals` authoritative, repoint all readers, then drop the
    legacy columns — only after a **staging rehearsal** (see P5) with reverse SQL.

### D5 — Lint backlog
The codebase carries pre-existing ESLint debt (legacy `any`, empty blocks, etc.).
- **NOT done:** a bulk lint fix — auto-fixing/`any`-tightening across the app can
  surface real type mismatches and is not worth the regression risk at go-live.
- **Current state:** CI runs lint as **advisory** (`continue-on-error` in
  `ci.yml`) so it reports without blocking. **Post-launch:** clean up file-by-file,
  then flip the Lint step back to blocking.

### P4 — Delivery observability
Background email/push/PDF failures currently surface only via `console.error`.
- **NOT done:** the `notification_deliveries` table + edge-function wiring — it's
  additive and safe, but the useful part changes the `verify-*` edge functions and
  needs a redeploy, which we're not doing during go-live.
- **Post-launch plan:** add a `notification_deliveries` table (status + error) and
  record each delivery outcome in the `waitUntil` background block of the two
  `verify-*` functions; surface failures in an admin view or a daily alert.

### P5 — Staging + rollback
- **NOT done here:** requires provisioning a dedicated **staging Supabase project**
  (infra, your side).
- **Post-launch plan:** stand up staging; apply every migration there first and run
  `supabase/functions/tests/security_invariants.test.ts` against it in CI (the CI
  job is already stubbed in `ci.yml`); write reverse SQL for risky migrations; tag
  each production publish for rollback. See `DEPLOYMENT.md`.

## Go-live posture
The system is functionally complete and the high-severity security issue (S1) is
fixed and live. The deferred items above are **maintainability / operability
improvements**, not blockers — none affects whether the app works. Pick them up
post-launch in the order that suits you (P4 and the D3 formalize step are the
highest operational value).
