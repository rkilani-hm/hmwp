# Deployment & Release Runbook — HM-WP

This app has **three surfaces that can drift out of sync**. Most production
incidents here (stale watermarked PDF, duplicate migrations) came from treating
"merged to `main`" as "shipped." It is not.

| Surface | What lives here | How it ships |
|---|---|---|
| **Git `main`** | source of truth for code + migration files | PRs merged to `main` |
| **Live database** | tables, RLS, functions | migrations **applied directly** (out-of-band) |
| **Deployed frontend + edge functions** | what users actually hit | **Lovable publish** |

> ⚠️ **Merge ≠ deploy ≠ migrate.** A PR merging to `main` does **not** apply
> migrations and does **not** deploy edge functions. Each surface advances on
> its own. Always advance all three, in order.

## Release order (do every time, in this order)

1. **Apply DB migrations first.** Apply the migration SQL to the live database
   (via the DB tool / Supabase). Verify the objects exist before shipping code
   that depends on them.
2. **Deploy edge functions.** Publish so the live functions match `main`.
   Functions changed via a GitHub merge are **not** auto-deployed — a Lovable
   publish (or explicit redeploy) is required. If a function still behaves like
   the old version after publishing, it did not redeploy — redeploy it
   explicitly.
3. **Publish the frontend.** Lovable publish. Hard-refresh (Ctrl-F5) to clear
   the cached bundle.

**Why order matters (ordering hazards):**
- A function deployed *before* its migration → it calls a DB object that
  doesn't exist yet → runtime error.
- A migration that drops/renames an object *before* the function stops using it
  → the still-live function breaks.

## Expand / contract for destructive migrations

Never drop or rename a column/function a live function still uses in one step:

1. **Expand** — add the new column/function/table. Deploy code that *reads* the
   new shape (tolerating the old).
2. **Migrate data** — backfill.
3. **Contract** — only after the new code is live everywhere, drop the old
   object in a later migration.

The unfinished "dual-write" (legacy status columns + `*_approvals` mirror) is
exactly a stuck expand/contract: expand + migrate are done; contract never
shipped. Finish it or formalize it (schedule the reconcile RPCs + a drift
alert). Record the decision in an ADR.

## Rules

- **Single migration authority.** Humans **or** Lovable author migrations — not
  both. Dual authorship is what creates duplicate/rebadged migration files.
- **Idempotent migrations only.** `CREATE OR REPLACE`, `IF NOT EXISTS`,
  `DROP ... IF EXISTS`, dedup guards (`WHERE NOT EXISTS`). Migrations may be
  re-applied; they must be safe to re-run.
- **Unique, ordered timestamps.** No two migration files share a timestamp
  prefix (undefined apply order on a fresh rebuild).
- **PRs only to `main`.** Enable branch protection (below). No direct pushes.

## Branch protection (enable once)

`Settings → Branches → Add rule` for `main`:
- ✅ Require a pull request before merging.
- ✅ Require status checks to pass → select the **CI / Frontend** and
  **CI / Edge functions** checks from `.github/workflows/ci.yml`.
- ✅ Require branches to be up to date before merging.

This makes the CI (type-check, lint, build, `deno check`) a hard gate and stops
the ungated direct-to-`main` commits.

## Rollback

- **Frontend / functions:** re-publish from the last known-good git tag/commit.
  Tag each production publish (`git tag deploy-YYYYMMDD-N`) so "roll back" means
  "publish tag N-1."
- **Migrations:** forward-only against the live DB — there is no `down`. For
  risky migrations write the paired reverse SQL *before* applying, and prefer a
  **staging** Supabase project to rehearse first.

## Recommended next steps (from the audit)

- Stand up a **staging** Supabase project; apply migrations there first and run
  `supabase/functions/tests/security_invariants.test.ts` against it in CI.
- Persist notification/PDF **delivery outcomes** to a table so background
  (`waitUntil`) failures are queryable/alertable instead of `console.error`-only.
