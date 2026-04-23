# Phase 1b — Gate Pass + Workflow Modify WebAuthn

**Depends on:** Phase 1 must be deployed first (tables `webauthn_credentials`
and `webauthn_challenges` must exist, plus the `webauthn-auth-challenge` edge
function).

**Purpose:** Close the remaining two server-side verification gaps that
Phase 1 left open.

## What's fixed

1. **Gate pass approval** — previously did client-side password re-auth and
   directly wrote to `gate_passes` with no server-side verification. Now
   routes through a new `verify-gate-pass-approval` edge function that
   enforces password or WebAuthn server-side, writes to
   `signature_audit_logs`, and computes workflow transitions authoritatively.
2. **Workflow modification** — `modify-permit-workflow` no longer accepts
   the `__BIOMETRIC_VERIFIED__` magic token. Instead it accepts a
   WebAuthn assertion bound to `purpose='workflow_modify'` for that specific
   permit.

## Files in this package

### Migration (extends signature_audit_logs for gate passes)
- `supabase/migrations/20260423150000_signature_audit_gate_pass.sql`

### New + updated edge functions
- `supabase/functions/verify-gate-pass-approval/index.ts` *(new)*
- `supabase/functions/modify-permit-workflow/index.ts` *(full replacement)*

### Client code
- `src/hooks/useSecureApproveGatePass.ts` *(new)*
- `src/hooks/useModifyPermitWorkflow.ts` *(full replacement)*
- `src/components/ModifyWorkflowDialog.tsx` *(full replacement)*

## Deployment steps

1. Copy files preserving the repo layout.
2. Run the new migration.
3. Deploy the two edge functions:
   ```bash
   supabase functions deploy verify-gate-pass-approval
   supabase functions deploy modify-permit-workflow
   ```
4. Update `src/pages/GatePassDetail.tsx` — replace the existing
   `handleSecureApproval` function with the version below:

```tsx
// Add at top:
import { useSecureApproveGatePass } from '@/hooks/useSecureApproveGatePass';
import type { AuthPayload } from '@/components/SecureApprovalDialog';

// Replace useApproveGatePass with:
const approveGatePass = useSecureApproveGatePass();

// Remove the old handleSecureApproval entirely (the one that does
// supabase.auth.signInWithPassword client-side), and replace with:

const handleSecureApproval = async (auth: AuthPayload, signature: string | null) => {
  await approveGatePass.mutateAsync({
    gatePassId: gp.id,
    role: approvalRole,
    comments,
    signature: approvalAction === 'approve' ? signature : null,
    approved: approvalAction === 'approve',
    auth,
    cctvConfirmed: approvalRole === 'security' ? cctvConfirmed : undefined,
  });
  setApprovalDialogOpen(false);
  setComments('');
};
```

5. Update the `<SecureApprovalDialog>` instance in GatePassDetail:

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

## Security properties gained

- **Gate pass approvals are now server-verified.** A modified client cannot
  bypass password or biometric verification — the gate_passes table is only
  updated via the edge function.
- **Challenge binding extended to workflow modification.** An assertion
  obtained for modifying permit A cannot be replayed on permit B.
- **Complete audit trail for gate passes** in `signature_audit_logs` with
  `auth_method`, `webauthn_credential_id`, IP, and device info.

## What's NOT done yet (Phase 2+)

- The old `useApproveGatePass` in `src/hooks/useGatePasses.ts` can remain as
  a fallback but should eventually be removed once all callers are migrated
  to `useSecureApproveGatePass`.
- The gate pass downstream notifications are simpler than permit's — the
  function sends requester email but doesn't fan out to next approvers yet.
  Add this in Phase 2b if needed.

## Back-out plan

If issues arise:
1. Redeploy the old `modify-permit-workflow/index.ts`.
2. The old `useApproveGatePass` is still in `useGatePasses.ts` and is
   unreferenced but functional — revert GatePassDetail.tsx to use it if
   needed.
