# Security / RLS Test Suite

Locks in the security invariants the system depends on. Each test is named after
the invariant it guards so a future regression points straight at the rule that
broke.

## Invariants covered

### A. RLS — `work_permits`
- **A1** Tenant SELECT scoped to own permits (sees own, sees 0 rows for another tenant's permit).
- **A2** Tenant cannot UPDATE a non-draft permit.
- **A3** Tenant cannot directly INSERT into `work_permits` (the public/anon path was removed; intake must go through `submit-public-permit`).
- **A4** Admin SELECT sees every permit.

### B. RLS — `user_roles` (privilege escalation guard)
- **B1** Tenant cannot INSERT into `user_roles` (cannot grant themselves any role).
- **B2** Tenant cannot UPDATE or DELETE `user_roles`.
- **B3** Admin can manage `user_roles`.

### C. RLS — `profiles`
- **C1** Tenant SELECT returns only their own profile (0 rows for another user).
- **C2** Admin SELECT sees all profiles.

### D. RLS — `public_submission_log`
- **D1** Anon cannot SELECT or INSERT.
- **D2** Authenticated tenant cannot SELECT or INSERT.

### E. Edge function auth
- **E1** `generate-permit-pdf` → 401 with no `Authorization` header.
- **E2** `generate-permit-pdf` → 403 when caller is not requester/approver/admin.
- **E3** `preview-permit-pdf` → 401 with no `Authorization` header (regression guard for the hole closed in this change).

## Running

The suite is a Deno test file. It needs **service-role** access to seed fixture
users + permits, then signs each fixture user in to obtain a real JWT and uses
an `authenticated`-context client to exercise the RLS rules end-to-end.

Required env vars (taken from your project `.env`):
- `VITE_SUPABASE_URL` (or `SUPABASE_URL`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` — **only available on a self-hosted / staging
  project**. On Lovable Cloud this is not exposed, so the suite is intended to
  be run against a staging copy of the database, not production.

Run from the repo root:

```bash
deno test --allow-net --allow-env --allow-read supabase/functions/tests/security_invariants.test.ts
```

Or filter to one invariant:

```bash
deno test --allow-net --allow-env --allow-read \
  supabase/functions/tests/security_invariants.test.ts \
  --filter "A1"
```

## Safety

- All fixture emails use the `rls-test-…@example.invalid` prefix so they're
  trivially identifiable.
- The suite tears down its own fixtures in an `afterAll`-style block, even on
  failure.
- **Do not run against production.** The suite refuses to start if
  `VITE_SUPABASE_URL` matches the production host listed in
  `PRODUCTION_HOSTS_DENYLIST` at the top of the test file — extend that list
  for your project.

## What's NOT covered here

- Tests that need a privileged DB session (`SET ROLE`, `SET LOCAL request.jwt.…`)
  are written instead via the supabase-js client because this environment
  has no direct Postgres URL. The end-to-end JWT path gives equivalent
  coverage of the RLS policies.
- E2 (the 403 path on `generate-permit-pdf`) needs another tenant's permit
  to exist; the suite seeds one and asserts the 403.
