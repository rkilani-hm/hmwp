# Scoped security hardening
- [x] Restrict reminder digest to service role and verify privileges.
- [x] Move onboarding role-email lookup to existing server sender; revoke browser lookup.
- [x] Guard pending-approval creation for requester, on-behalf, admin, and service callers; confirm deployed guard.
- [x] Validate contractor inputs and tenant links without removing anonymous access; confirm deployed guard.
- [x] Re-run all four privilege checks and confirm clean build.
- [x] Skip account creation, session minting, and account-based flow checks as requested.
- [x] Commit and confirm all scoped changes are saved.