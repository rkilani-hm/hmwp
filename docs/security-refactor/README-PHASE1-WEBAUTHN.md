# Phase 1 — WebAuthn Security Fix

**Purpose:** Replace the insecure `__BIOMETRIC_VERIFIED__` magic-token flow
with a real WebAuthn (FIDO2) credential registration and per-action-bound
assertion verification.

**What was broken:** The previous biometric "verification" called
`navigator.credentials.get()`, threw away the assertion, and sent a magic
string `"__BIOMETRIC_VERIFIED__"` to the server — which trusted it blindly.
A compromised session token or modified client could approve any permit with
zero biometric or password check.

**What's fixed:**
- Registered credentials are stored per-user with their public key + counter.
- Approval requires a server-generated, single-use, action-bound challenge.
- The client produces an assertion signed by the private key on-device; the
  server verifies the signature against the stored public key.
- Challenge binding prevents replay: an assertion for permit A / role=IT /
  action=approve cannot be reused on permit B, or on rejecting permit A.
- Counter verification detects cloned authenticators.

---

## Files in this package

### New migration
- `supabase/migrations/20260423140000_webauthn_credentials.sql`

### New + updated edge functions
- `supabase/functions/_shared/webauthn.ts` *(shared helpers, new)*
- `supabase/functions/webauthn-register-begin/index.ts` *(new)*
- `supabase/functions/webauthn-register-finish/index.ts` *(new)*
- `supabase/functions/webauthn-auth-challenge/index.ts` *(new)*
- `supabase/functions/webauthn-credentials-list/index.ts` *(new)*
- `supabase/functions/webauthn-credentials-delete/index.ts` *(new)*
- `supabase/functions/verify-signature-approval/index.ts` *(full replacement)*

### Rewritten client code
- `src/hooks/useBiometricAuth.ts` *(full replacement)*
- `src/components/SecureApprovalDialog.tsx` *(full replacement)*
- `src/components/BiometricDevices.tsx` *(new — put in Settings)*
- `src/hooks/useSecureApprovePermit.patch.ts` *(patch snippet for useWorkPermits.ts)*

### Small localized edits described in `PATCHES.md`
- `src/hooks/useWorkPermits.ts`
- `src/pages/ApproverInbox.tsx`
- `src/pages/PermitDetail.tsx`
- `src/pages/GatePassDetail.tsx`
- `src/components/ModifyWorkflowDialog.tsx`
- `src/pages/Settings.tsx`

---

## Deployment steps

### 1. Add npm dependency

```bash
npm install @simplewebauthn/browser@10
# or: bun add @simplewebauthn/browser@10
```

### 2. Copy files into the repo

All files in this package use the same relative path as the repo layout.
Drop the entire `supabase/` and `src/` trees from this package on top of the
repo. Then apply the small edits documented in `PATCHES.md`.

### 3. Set Supabase environment variables (for the edge functions)

In Supabase Dashboard → Project Settings → Edge Functions → Secrets:

| Name | Example value |
|------|---------------|
| `WEBAUTHN_RP_ID` | `hmwp.lovable.app` (or `permits.alhamra.com.kw` when custom domain is set) |
| `WEBAUTHN_RP_NAME` | `Al Hamra Work Permit System` |
| `WEBAUTHN_ORIGINS` | `https://hmwp.lovable.app,https://permits.alhamra.com.kw` |

**Critical:** `WEBAUTHN_RP_ID` must be the **eTLD+1 domain** of where the app
is served. WebAuthn will refuse assertions whose RP ID does not match the
origin. If you serve from multiple origins (staging + prod), put all of them
in `WEBAUTHN_ORIGINS` comma-separated, but the RP ID must match the parent
domain they share (e.g. `alhamra.com.kw`), OR you must run separate RP IDs
per environment.

### 4. Run the migration

Via Supabase CLI:
```bash
supabase db push
```

Or via Supabase Dashboard → SQL Editor — paste the contents of
`supabase/migrations/20260423140000_webauthn_credentials.sql` and run.

### 5. Deploy edge functions

Via Supabase CLI:
```bash
supabase functions deploy webauthn-register-begin
supabase functions deploy webauthn-register-finish
supabase functions deploy webauthn-auth-challenge
supabase functions deploy webauthn-credentials-list
supabase functions deploy webauthn-credentials-delete
supabase functions deploy verify-signature-approval
```

If you're using Lovable's GitHub sync, pushing these files to the repo should
cause Supabase to auto-deploy them (Lovable-managed projects typically have
function deploy wired up). Confirm in Supabase Dashboard → Edge Functions
that all six show the latest timestamp.

### 6. Test the flow

1. Sign in as a user on a device with a platform authenticator (TouchID /
   FaceID / Windows Hello / Android fingerprint).
2. Go to **Settings → Biometric Devices** → **Add this device**. Name it,
   approve the biometric prompt. Device should appear in the list.
3. Open a pending permit as an approver on a **mobile device** (biometric
   tab only shows on mobile by current design). Approve → choose Fingerprint
   tab → verify → approval should proceed.
4. Check Supabase Table Editor:
   - `webauthn_credentials` has your device, `counter` increments after each use.
   - `signature_audit_logs` rows have `auth_method='webauthn'` and a
     `webauthn_credential_id` reference.
   - `webauthn_challenges` rows have `consumed=true` after use.

### 7. Back out plan

If something goes wrong in production:

1. The **password fallback is preserved** and unchanged — desktop and any
   unregistered user can still approve via password.
2. To fully roll back: redeploy the old `verify-signature-approval/index.ts`
   and the old `src/hooks/useBiometricAuth.ts`. The new migration is
   additive only (new tables, new columns) — safe to leave in place even
   if rolled back.

---

## What this phase does *not* fix (deferred to later phases)

### Phase 1b (next, small)
- `GatePassDetail.handleSecureApproval` currently verifies password
  client-side by re-signing-in, and never calls an edge function. Needs a
  sibling `verify-gate-pass-approval` edge function.
- `ModifyWorkflowDialog` biometric path — same pattern as approval, but
  bound to `purpose='workflow_modify'`.

### Phase 2 (medium)
- Hardcoded per-role columns on `work_permits` and `gate_passes` — root
  cause of the "adding a role = edit 8 files" pain. Will introduce
  `permit_approvals` and `gate_pass_approvals` tables.

### Phase 3 (larger)
- Dynamic workflow engine extensions: parallel steps, conditional branches,
  field-based rules (e.g. "if has_high_value_asset then Finance required").
- Form schema engine (kill monolithic wizards).
- Template-based PDF and email rendering.
- Full brand guide application across the UI, emails, and PDFs.

---

## Security properties of this implementation

- **No trust in the client for auth claims.** The server issues the
  challenge, holds it bound to user + action, and verifies the signature
  against the stored public key. The client only proves possession of the
  private key at the moment of the prompt.
- **Action binding.** An assertion is only valid for the exact
  `{permitId, role, action}` tuple the challenge was issued for. No replay
  across actions or resources.
- **Single-use challenges.** Consumed atomically on verification; concurrent
  reuse is detected by an atomic UPDATE with `consumed=false` guard.
- **Counter validation.** Detects cloned authenticators (when the
  authenticator actually supports counters — many platform authenticators
  always return 0, which we permit).
- **Origin + RP ID validation.** Prevents phishing-based assertion replay
  from a different domain.
- **Rate limits on all endpoints.** Prevents brute-force against challenge
  endpoints.
- **Audit logs** record `auth_method` and `webauthn_credential_id` for
  every approval.

---

## Known limitations

- Platform authenticator only (requires on-device biometric). No roaming
  authenticator (YubiKey) support — can be added by relaxing
  `authenticatorAttachment` in `webauthn-register-begin`.
- In-memory rate limit store is per-edge-instance. At very high traffic,
  redis-backed rate limiting is better — fine for expected load here.
- Credentials are stored with RS256/ES256 algorithms (the defaults). Not
  configurable via env yet.
