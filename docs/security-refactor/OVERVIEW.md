# HMWP Security & Architecture Refactor

This package contains the first three phases of a staged refactor of the
Al Hamra work-permit + gate-pass system (`rkilani-hm/hmwp`). The phases
are **independently deployable and independently revertible**. Deploy in
order; validate each before moving to the next.

All file paths inside each phase directory match the target repo path
(`supabase/migrations/…`, `src/hooks/…`, etc.), so copying each phase's
contents on top of the repo preserves structure.

---

## The core problems being fixed

### 1. Biometric authentication is theater (CRITICAL)

The existing "biometric verification" calls `navigator.credentials.get()`,
**throws away the assertion**, and sends the magic string
`"__BIOMETRIC_VERIFIED__"` to the server. The server checks
`password === BIOMETRIC_TOKEN` and skips verification. A modified client
— or anyone who obtains a valid session token — can approve any permit,
reject any permit, or modify any workflow with zero real authentication.

This affects three flows:
- Permit approvals (`verify-signature-approval`)
- Gate-pass approvals (client-side reauth, **no edge function verifies**)
- Workflow modifications (`modify-permit-workflow`)

**Phase 1 + 1b fix all three** with real WebAuthn (FIDO2).

### 2. Hardcoded per-role approval columns

`work_permits` has ~17 roles × 6 columns ≈ 100 approval columns.
`gate_passes` is similar. Adding a new approver requires editing
~8 files (table schema, enum, 2+ edge functions, 2 React pages, PDF
generator, email templates). A dynamic workflow engine (`workflow_steps`,
`roles`, `work_type_step_config`) was added later but the **approval data
is still stored in the hardcoded columns**, defeating the engine.

Approval code also uses dangerous dynamic column interpolation
(`` `${roleField}_status` ``) to work around this.

**Phase 2a fixes the schema**, Phase 2b migrates the code.

---

## Deployment order

```
Phase 1   →   Phase 1b   →   Phase 2a   →   [Phase 2b, Phase 3 — future]
```

### Phase 1 — WebAuthn for permit approvals
`phase1-webauthn/` — 14 files

- New `webauthn_credentials` and `webauthn_challenges` tables.
- 6 new edge functions covering registration, authentication challenges,
  and credential management.
- `verify-signature-approval` rewritten to accept either a password or a
  WebAuthn assertion (discriminated-union authMethod input).
- `useBiometricAuth.ts` rewritten against `@simplewebauthn/browser`.
- `SecureApprovalDialog.tsx` rewritten — now binds to `{permitId, role}`
  so an assertion cannot be replayed on a different permit or role.
- New `BiometricDevices.tsx` for the Settings page.
- Fully documented in `phase1-webauthn/README-PHASE1-WEBAUTHN.md` and
  `phase1-webauthn/PATCHES.md`.

**One npm dependency required:** `@simplewebauthn/browser@10`.
**Three Supabase env vars required:** `WEBAUTHN_RP_ID`,
`WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS`.

### Phase 1b — Gate pass + workflow-modify WebAuthn
`phase1b-gate-pass-webauthn/` — 6 files

Depends on Phase 1. Closes the two remaining server-side verification gaps.

- New `verify-gate-pass-approval` edge function (gate-pass approvals were
  previously done with **client-side** password reauth — zero server
  verification). Same discriminated auth shape as Phase 1.
- `modify-permit-workflow` rewritten to remove the `__BIOMETRIC_VERIFIED__`
  magic token path and accept a real WebAuthn assertion bound to
  `purpose='workflow_modify'` for that specific permit.
- New `useSecureApproveGatePass` hook.
- Rewritten `useModifyPermitWorkflow` and `ModifyWorkflowDialog`.
- Fully documented in `phase1b-gate-pass-webauthn/README-PHASE1b-WEBAUTHN.md`.

### Phase 2a — New approvals data model
`phase2a-approvals-model/` — 1 file (a single migration)

**Schema-only, 100% backwards compatible.** Does not change any
application code. Deploy any time.

- Creates `permit_approvals` and `gate_pass_approvals` (one row per
  permit × role).
- Backfills from existing per-role columns (tested end-to-end).
- Creates `permit_pending_approvals` / `gate_pass_pending_approvals`
  views for inbox queries.
- Creates `reconcile_permit_approvals(permit_id)` function for Phase 2b
  drift-repair.
- Fully documented in `phase2a-approvals-model/README-PHASE2a-APPROVALS-MODEL.md`
  including Phase 2b guidance.

---

## What's NOT in this package (future phases)

### Phase 2b — Dual-write then cut over (medium)

1. Edge functions `verify-signature-approval` + `verify-gate-pass-approval`
   dual-write to both legacy columns and new approvals tables.
2. Inbox / detail / PDF / email code switches reads to the new tables.
3. Drop the per-role columns.
4. Replace `permit_status` enum with derived `current_step_role`.

### Phase 3 — Workflow engine extensions + branding (large)

- Parallel step groups + conditional steps (rule expressions in JSONB).
- Escalation and delegation.
- Form-schema engine (`form_templates` + `SchemaForm` renderer).
- Template-based PDF generation.
- `email_templates` table.
- Full Al Hamra brand guideline application (fonts, colors, tokens, PDFs,
  emails, UI chrome).

> *Note: the brand guidelines PDF was not accessible in this session —
> the uploads folder was empty. Please re-upload the Al Hamra brand
> guidelines before starting Phase 3.*

---

## Validation status

| Phase | SQL migrations | Edge functions | Client code | Live-tested |
|-------|---------------:|---------------:|------------:|-------------|
| 1     | Validated (PG16) | Compiles; requires Supabase deploy | Compiles | ❌ — deploy to staging |
| 1b    | Validated (PG16) | Compiles; requires Supabase deploy | Compiles | ❌ — deploy to staging |
| 2a    | **Validated (PG16) — backfill round-tripped TEST-001 + GP-001** | n/a | n/a | ❌ — deploy to staging |

**Testing checklist for you before production:**

1. Apply to a staging Supabase project (same Postgres version).
2. Register a biometric credential on iOS Safari, Android Chrome, and
   desktop Chrome — confirm each succeeds.
3. Approve a test permit with password path — confirm audit log has
   `auth_method='password'`.
4. Approve a test permit with WebAuthn path — confirm audit log has
   `auth_method='webauthn'` and `webauthn_credential_id` populated.
5. Attempt to replay a captured assertion on a second permit — confirm
   edge function rejects it (binding mismatch).
6. Run Phase 2a migration against a staging DB with real data; compare
   `permit_approvals` to source columns with the validation queries in
   the Phase 2a README.

---

## Back-out

- Each phase is additive. Phase 1 and 1b preserve password paths, so you
  can temporarily disable the WebAuthn path by not registering any
  credentials.
- Phase 2a can be reverted by dropping the new tables; no application
  code reads from them.
- Migration files are ordered 2026-04-23-14:00:00 / 15:00:00 / 16:00:00
  so `supabase db push` applies them in the right order.
