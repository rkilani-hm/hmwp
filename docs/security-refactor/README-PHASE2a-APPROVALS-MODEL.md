# Phase 2a — New Approvals Data Model

**Purpose:** Introduce the correct shape for approvals — one row per
approval event — so adding a new approver role stops requiring edits across
8+ places. This is the landing zone; Phase 2b will migrate application code
to read/write through the new tables, and Phase 2c/d will eventually drop
the legacy per-role columns.

## What this phase does

- Creates `permit_approvals` (one row per permit × role).
- Creates `gate_pass_approvals` (one row per gate pass × role).
- Backfills both tables from the existing hardcoded per-role columns.
- Creates two convenience views (`permit_pending_approvals`,
  `gate_pass_pending_approvals`) that pre-join parent data for inbox
  queries.
- Installs `reconcile_permit_approvals(permit_id)` function for repairing
  drift during dual-write rollout.

## What this phase does NOT do

- Change any application code — existing hooks, edge functions, PDFs, and
  emails continue reading from the legacy per-role columns.
- Drop any legacy columns.
- Change the `permit_status` enum.

This means **this migration is 100% backwards-compatible**. Deploy it any
time — if you never migrate the application, you just have an unused
shadow table. If you roll back the rest of the refactor, the tables can
stay or be dropped without affecting the live system.

## Files in this package

- `supabase/migrations/20260423160000_approvals_tables.sql`

## Deployment

```bash
# Via CLI
supabase db push

# Or via Dashboard → SQL Editor, paste the migration file.
```

The migration is idempotent on the schema side (`CREATE TABLE IF NOT
EXISTS`) but the **backfill DO blocks only run once at apply time**. If
you need to re-backfill after a drop-and-recreate, either re-run the
migration or call `reconcile_permit_approvals(permit_id)` per permit.

## Validation queries

Run these after deployment to confirm data landed:

```sql
-- Count of approval records created
SELECT count(*) FROM permit_approvals;
SELECT count(*) FROM gate_pass_approvals;

-- Distribution of statuses
SELECT status, count(*) FROM permit_approvals GROUP BY status;
SELECT status, count(*) FROM gate_pass_approvals GROUP BY status;

-- Pending approvals for a specific approver (example)
SELECT * FROM permit_pending_approvals WHERE role_name = 'it' LIMIT 10;
```

## Phase 2b guidance (next after 2a)

Once you've deployed 2a and verified the data matches, Phase 2b is:

1. **Dual-write** in the approval edge functions:
   - `verify-signature-approval` writes to both `work_permits.<role>_*`
     AND `permit_approvals`.
   - `verify-gate-pass-approval` writes to both `gate_passes.<role>_*`
     AND `gate_pass_approvals`.
   Use an UPSERT with `ON CONFLICT (permit_id, role_name) DO UPDATE`.

2. **Switch reads** progressively:
   - Inbox queries switch to `permit_pending_approvals` view.
   - Permit detail page reads approvals list from `permit_approvals`.
   - PDF generator reads approvals list from `permit_approvals`.
   - Email notifications read approver names from `permit_approvals`.

3. **Kill the per-role columns** once reads are all through the new tables
   for at least a release cycle. Drop the columns in a single migration.

4. **Replace `permit_status` enum** with plain `text` + a derived
   `current_step_role` computed from `permit_approvals` (the lowest
   `workflow_steps.step_order` where `status='pending'`). This kills the
   second source of coupling between the schema and the workflow engine.

Dual-write is the safe approach because it keeps the legacy column path
functional the entire time. Fix any drift with `reconcile_permit_approvals`.

## Schema reference

```
permit_approvals
  id                      uuid PK
  permit_id               uuid FK → work_permits
  workflow_step_id        uuid FK → workflow_steps (nullable)
  role_id                 uuid FK → roles (nullable)
  role_name               text (denormalized)
  status                  text CHECK ('pending','approved','rejected','skipped')
  approver_user_id        uuid FK → auth.users
  approver_name, approver_email, approved_at, comments, signature
  signature_hash
  auth_method             text CHECK ('password','webauthn',NULL)
  webauthn_credential_id  uuid FK → webauthn_credentials
  ip_address, user_agent, device_info (jsonb)
  created_at, updated_at
  UNIQUE (permit_id, role_name)
```

Same shape for `gate_pass_approvals`, plus `extra jsonb` for role-specific
data (cctv_confirmed, material_action).

## RLS summary

- **Requesters** can SELECT approvals for permits/passes they created.
- **Approvers** (via `is_approver` / `is_gate_pass_approver`) can SELECT
  all approvals.
- **INSERT / UPDATE** only via service role (edge functions) — no
  authenticated-user policies on those operations.
- **Admins** can DELETE (e.g. for cleanup).
