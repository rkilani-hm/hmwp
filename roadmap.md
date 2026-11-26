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

# Staff client-permit access by email domain
- [x] Decide internal staff from the email domain (Al Hamra / Ecovert) instead of roles, in the page guard and the staff menus.
- [x] Update the isolated access tests for the four email cases; build clean and commit.
# Monitoring findings: approval triggers and rework email
- [x] Verify current database callers and dashboard query; dashboard finding is stale.
- [x] Restore trigger-driven approval assignment without widening direct client access.
- [x] Correct rework email status validation and add isolated regression coverage.
- [x] Verify deployed changes, clean build, resolve findings, and finalize for commit; 53 isolated tests passed, live privilege/count checks passed, no sessions or real messages created.
- [x] Sweep approval-assignment and rework-notification sibling paths; fix workflow-trigger assignment and enum-safe All Permits pending counts; preserve settled records and unrelated permissions.
