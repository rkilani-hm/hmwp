# Spec: Gate Pass approver notifications (parity with Work Permit)

## Objective
When a Gate Pass is submitted, resubmitted, advances to the next step, or is
forwarded, the responsible approver(s) must be notified — in-app + email + push —
exactly as Work Permits are. Today GPs notify no one automatically.

## Findings from live investigation (authoritative basis)
- `useGatePasses.ts` has NO notify / `send-email-notification` / `send-push-notification`
  / `functions.invoke` calls — GP creation and approval send NOTHING to approvers.
- WP fan-out is server-side via `notify_permit_active_approvers` (SECURITY DEFINER,
  delegation/forward-aware, idempotent in-app insert; returns user_ids + emails for
  the email/push edge functions). Called from `notifyActiveApprovers` in
  `useWorkPermits.ts` on submit/resubmit/forward, and the `verify-signature-approval`
  edge function notifies the next step on advancement.
- The same RLS rationale applies: a tenant/requester session can't read
  `user_roles`/`profiles` for other users, so the resolution MUST be SECURITY
  DEFINER server-side (mirror the WP fix).

## Dependency
Builds on `gate-pass-active-approver-resolution.md` (`gate_pass_active_approvers`)
so the notifier can resolve the current recipients the same way WP does.

## Requirements
R1. **`notify_gate_pass_active_approvers(p_gate_pass_id, p_notification_type)`**
    SECURITY DEFINER, mirroring `notify_permit_active_approvers`:
    - Resolve current-step role holders from `gate_pass_active_approvers`.
    - Reroute each holder to their active delegate (`active_delegation_for`) and,
      if GP forward is in scope, to the active forward target — delegate/forward
      only, deduped (E1 parity).
    - Insert idempotent in-app notifications; return user_ids + emails for the
      email/push edge functions.
    - Honor the tenant-notification filter trigger already on `notifications`.
R2. **Wire GP create/resubmit/forward** in `useGatePasses` (and the GP approve
    path) to call the RPC then hand user_ids/emails to `send-push-notification` /
    `send-email-notification`, exactly like `notifyActiveApprovers` does for WP.
R3. **Advancement notification.** When a GP step is approved and advances, notify
    the next step's approver(s) (mirror the WP `verify-signature-approval`
    next-step notify, with the same delegation/forward reroute).
R4. **Notification types + copy** consistent with WP (new, resubmitted, approved,
    rejected, step-approved), reusing the existing `notifications.type` taxonomy and
    the tenant-suppression rules.
R5. **No duplicate/parallel notifier.** Use the one SECURITY DEFINER resolution
    path; do not hand-roll role lookups in the client.

## Edge cases
E1. Forwarded/delegated GP step → single recipient (the delegate/forward target),
    not the original holder; deduped.
E2. Approver with no email → surfaced/logged like WP (`skipped_no_email`).
E3. Resubmit after rework re-notifies the current step.
E4. Final approval / completion notifies the requester (and any GP CC analog), not
    the next approver.

## Definition of done (verified against LIVE state)
- [ ] Submitting a GP inserts in-app notifications for the current-step
      approver(s) and returns their emails; email + push fire.
- [ ] A delegate of the active-role holder is notified instead of the holder.
- [ ] Advancing a GP notifies the next step's approver(s).
- [ ] Tenant requesters only get the allowed GP notification types (filter trigger).
- [ ] `notify_gate_pass_active_approvers` exists in LIVE DB, SECURITY DEFINER,
      EXECUTE to authenticated.
- [ ] App builds; `deno check` passes on any edited edge function.

## Deployment note (outside the loop)
DB function is a migration applied to Supabase; any edited edge function must be
DEPLOYED; frontend deploys via Lovable publish. Re-verify with a real GP
submission after deploy.
