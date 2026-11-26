# Security Pass 2
- [x] Trace the five functions, browser/server callers, and notification triggers without creating accounts or sessions.
- [x] Require sign-in for AI and restrict email/push senders.
- [x] Move browser notification flows behind validated server actions with server-derived recipients.
- [x] Scope PDF emails to the specific document and audit senders.
- [x] Run 38 isolated authorization tests and verify all six deployed endpoints reject an explicitly invalid bearer; build clean.
- [x] Finalize the scoped change set for commit. Production pages require publishing to use the new notification gateway.

# Staff client-permit creation access
- [x] Inspect the three staff sidebar sections, tenant routes, and existing on-behalf permission hook.
- [x] Restrict staff New Permit links and guard direct page access without changing tenant/internal flows or backend permissions.
- [x] Verify seven isolated access tests and clean preview build; no users or sessions created.