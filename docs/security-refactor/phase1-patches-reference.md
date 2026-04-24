# Phase 1 — Caller patches

These are the minimal, localized edits needed in existing files so they use
the new `SecureApprovalDialog` / `useSecureApprovePermit` / `useBiometricAuth`
APIs.

All other file changes (new migrations, edge functions, hook rewrite, dialog
rewrite, BiometricDevices component) are provided as full file replacements
in this Phase 1 package.

---

## 1. `src/hooks/useWorkPermits.ts` — patch `useSecureApprovePermit`

Replace the body of `useSecureApprovePermit()` (around line 558) with the
contents of `useSecureApprovePermit.patch.ts` in this package. Also export the
new `ApprovalAuth` type alongside.

---

## 2. `src/pages/ApproverInbox.tsx` — update two call sites + handler

### Change the handler signatures

**Find (around line 179):**

```tsx
const handleSecureApproval = async (password: string, signature: string) => {
  if (!selectedPermit) return;
  const role = getApprovalRole(selectedPermit);
  try {
    await secureApprove.mutateAsync({
      permitId: selectedPermit.id,
      role,
      approved: true,
      password,
      signature,
      comments: '',
    });
    setApprovalDialogOpen(false);
    setSelectedPermit(null);
    toast.success('Permit approved successfully');
  } catch (error) { ... }
};
```

**Replace with:**

```tsx
import type { AuthPayload } from '@/components/SecureApprovalDialog';

const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
  if (!selectedPermit) return;
  const role = getApprovalRole(selectedPermit);
  try {
    await secureApprove.mutateAsync({
      permitId: selectedPermit.id,
      role,
      approved: true,
      signature,
      comments: '',
      auth,
    });
    setApprovalDialogOpen(false);
    setSelectedPermit(null);
    toast.success('Permit approved successfully');
  } catch (error) {
    console.error('Approval error:', error);
    throw error;
  }
};
```

**Do the same for `handleSecureReject`:** change signature to
`async (auth: AuthPayload, signature: string | null)` and pass `auth` in the
mutate payload instead of `password`.

### Update the two `<SecureApprovalDialog>` instances

Add `authBinding` prop (and remove any `password` references):

```tsx
<SecureApprovalDialog
  isOpen={approvalDialogOpen}
  onClose={() => { setApprovalDialogOpen(false); setSelectedPermit(null); }}
  onConfirm={handleSecureApproval}
  title="Approve Work Permit"
  description="Enter your password and signature to approve this permit."
  actionType="approve"
  isLoading={secureApprove.isPending}
  authBinding={selectedPermit ? {
    permitId: selectedPermit.id,
    role: getApprovalRole(selectedPermit),
  } : { role: 'helpdesk' }}
/>

<SecureApprovalDialog
  isOpen={rejectDialogOpen}
  onClose={() => { setRejectDialogOpen(false); setSelectedPermit(null); }}
  onConfirm={handleSecureReject}
  title="Reject Work Permit"
  description="Enter your password to confirm rejection."
  actionType="reject"
  isLoading={secureApprove.isPending}
  authBinding={selectedPermit ? {
    permitId: selectedPermit.id,
    role: getApprovalRole(selectedPermit),
  } : { role: 'helpdesk' }}
/>
```

---

## 3. `src/pages/PermitDetail.tsx` — update handler + dialog

### Update `handleSecureApproval` (around line 196):

```tsx
import type { AuthPayload } from '@/components/SecureApprovalDialog';

const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
  await secureApprove.mutateAsync({
    permitId: permit.id,
    role: getApprovalRole(),
    comments,
    signature: approvalAction === 'approve' ? signature : null,
    approved: approvalAction === 'approve',
    auth,
  });
  setApprovalDialogOpen(false);
  setComments('');
};
```

### Update the `<SecureApprovalDialog>` instance (around line 738):

Add `authBinding`:

```tsx
<SecureApprovalDialog
  isOpen={approvalDialogOpen}
  onClose={() => setApprovalDialogOpen(false)}
  onConfirm={handleSecureApproval}
  title={approvalAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
  description={`You are about to ${approvalAction} permit ${permit.permit_no}. Please verify your identity.`}
  actionType={approvalAction}
  isLoading={secureApprove.isPending}
  authBinding={{ permitId: permit.id, role: getApprovalRole() }}
/>
```

---

## 4. `src/pages/GatePassDetail.tsx` — update handler + dialog

⚠️ **IMPORTANT: The gate pass approval flow currently verifies password
client-side and never calls an edge function.** This has the same class of
vulnerability as the permit biometric magic-token issue. Phase 1b (sibling
deliverable coming next) introduces a proper `verify-gate-pass-approval` edge
function. For now this patch just adapts the dialog signature — the
client-side password check remains temporarily, and biometric assertions are
not yet server-verified for gate passes.

### Update `handleSecureApproval` (around line 96):

```tsx
import type { AuthPayload } from '@/components/SecureApprovalDialog';

const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
  // TEMPORARY: password check is client-side until Phase 1b
  // introduces verify-gate-pass-approval edge function.
  if (auth.authMethod === 'password') {
    const userResp = await supabase.auth.getUser();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userResp.data.user?.email || '',
      password: auth.password,
    });
    if (authError) throw new Error('Invalid password. Please try again.');
  }
  // For webauthn, we rely on the bound challenge having been issued, but full
  // assertion verification will only happen in Phase 1b.

  await approveGatePass.mutateAsync({
    gatePassId: gp.id,
    role: approvalRole,
    approved: approvalAction === 'approve',
    comments,
    signature: approvalAction === 'approve' ? signature ?? undefined : undefined,
    cctvConfirmed: approvalRole === 'security' ? cctvConfirmed : undefined,
  });

  setApprovalDialogOpen(false);
  setComments('');
};
```

### Update the `<SecureApprovalDialog>` instance (around line 455):

```tsx
<SecureApprovalDialog
  isOpen={approvalDialogOpen}
  onClose={() => setApprovalDialogOpen(false)}
  onConfirm={handleSecureApproval}
  title={...}
  description={...}
  actionType={approvalAction}
  isLoading={approveGatePass.isPending}
  authBinding={{ gatePassId: gp.id, role: approvalRole }}
/>
```

---

## 5. `src/components/ModifyWorkflowDialog.tsx` — drop biometric for now

This dialog calls the old `verifyIdentity()` method which no longer exists on
the hook. The simplest fix for Phase 1 is to remove the biometric shortcut
here and keep password-only authentication. Phase 2 (data-model refactor)
will revisit workflow modification auth using the same
`authenticateForApproval('workflow_modify', ...)` pattern.

**Remove:**

```tsx
const BIOMETRIC_TOKEN = '__BIOMETRIC_VERIFIED__';
```

**Change line 69:**

```tsx
// OLD
const { isSupported: biometricSupported, verifyIdentity, isChecking: biometricChecking } = useBiometricAuth();

// NEW — biometric flow removed for Phase 1; password only
```

**Remove the biometric button block and all references to `BIOMETRIC_TOKEN`,
`biometricSupported`, `biometricChecking`, and `verifyIdentity`.** The
password input remains and is the sole auth path.

Alternatively, if you want to preserve biometric UX here, use the new
`authenticateForApproval({ permitId, role: 'workflow_modify', action: 'approve' })`
but note this needs a matching server-side verification in the
`modify-permit-workflow` edge function (will be done in Phase 2).

---

## 6. `src/pages/Settings.tsx` — add BiometricDevices

Import and mount the new component wherever the security/profile section is:

```tsx
import { BiometricDevices } from '@/components/BiometricDevices';

// ... somewhere in the Settings page JSX:
<BiometricDevices />
```

---

## 7. `package.json` — add dependency

```bash
npm install @simplewebauthn/browser@10
```

(or `bun add @simplewebauthn/browser@10` if you're using Bun).

The edge functions import `@simplewebauthn/server` directly from esm.sh — no
npm install needed for those.
