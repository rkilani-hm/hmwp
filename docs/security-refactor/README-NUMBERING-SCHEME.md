# Numbering scheme — WP-YYMMDD-NN / GP-YYMMDD-NN (Kuwait local)

Replaces the previous client-generated `Date.now().toString(36)` scheme
with a daily-resetting 2-digit sequence keyed on Kuwait local time.

## Format

```
WP-YYMMDD-NN          internal + external work permits
GP-YYMMDD-NN          gate passes
WP-YYMMDD-NN_V1       first rework resubmission of the same permit
WP-YYMMDD-NN_V2       second rework resubmission
```

Examples (today is 2026-04-25 Kuwait local):

```
WP-260425-01          first work permit today
WP-260425-02          second work permit today
WP-260425-99          99th and last permitted today
WP-260426-01          first work permit tomorrow
GP-260425-01          first gate pass today
WP-260425-01_V1       first rework resubmission of WP-260425-01
WP-260425-01_V2       second rework resubmission
```

A permit's *base* number stays stable across all rework cycles; only
the suffix changes. The `_V` suffix (underscore V) replaces the
previous `-V` (dash V) suffix in the rework hook.

## Why the change

The previous scheme had three problems:

1. Numbers were unreadable — `WP-LZG2K4F8` carries no information a
   human can use without looking up the row.
2. Three different generators (`WP-`, `GP-`, `INT-`) for what was
   really three views of the same idea.
3. Client-generated sequences can collide if two clients allocate at
   the same millisecond. With base36-encoded ms the odds were
   astronomically low so it was tolerable, but moving away from
   client generation removes the risk entirely.

The new scheme:

- Date in number means staff can tell at a glance how old a permit
  is.
- Daily sequence means N permits have been raised so far today
  without a database query.
- Server-allocated means impossible to collide.

## Implementation

### Migration: `supabase/migrations/20260425150000_numbering_scheme.sql`

Three Postgres functions:

- `next_permit_number(target_date)` returns `WP-YYMMDD-NN` for the
  given date. Atomic via `pg_advisory_xact_lock` keyed on the date —
  two concurrent callers on the same day serialize, different days
  run in parallel. Caps at NN=99/day; raises a clear error if
  exhausted.
- `next_gate_pass_number(target_date)` — same shape for `GP-`.
- `next_permit_number_today()` and `next_gate_pass_number_today()`
  are convenience wrappers that pin to Kuwait local time
  (`now() AT TIME ZONE 'Asia/Kuwait'`). The frontend calls these
  via `supabase.rpc()`.

Adds `UNIQUE` to `gate_passes.pass_no`. The previous random scheme
made collisions astronomically unlikely so it didn't need the
constraint; with a daily counter, collisions become a real concern.

`work_permits.permit_no` already had `UNIQUE` from earlier.

### Frontend changes

Three hooks switched from client-side allocation to RPC:

- `src/hooks/useWorkPermits.ts` — internal permit creation
- `src/hooks/useGatePasses.ts` — gate pass creation
- `src/hooks/usePublicPermit.ts` — public-portal permit creation,
  also drops the `INT-` prefix and unifies under `WP-`. The
  `is_internal` flag on the row still distinguishes external from
  internal — the permit_no doesn't need to encode it.

The rework path in `useWorkPermits.ts` now uses `_V<n>` instead of
`-V<n>` and fixes a pre-existing off-by-one in suffix calculation.
The regex for stripping old suffixes accepts both `-V` and `_V` so
in-flight reworks of historical permits don't break.

## Concurrency

Validated against Postgres 16 with two simultaneous transactions
both calling `next_permit_number` for the same day, both inserting.
First gets `WP-260428-01`, second blocks on the advisory lock until
first commits, then gets `WP-260428-02`. No collision possible.

The sequence is computed by scanning existing rows for that date's
prefix and taking `MAX(NN) + 1`. With the advisory lock held during
the scan + insert, no two transactions can return the same number.

## Existing data

**Not touched.** Per user direction, historical permits (with the old
`WP-LZG2K4F8` style numbers) will be deleted manually after this
deploy. The new format applies to every new permit/pass from migration
forward.

If any old-format records are *not* deleted, they continue to function
normally — the unique constraint and lookup logic don't care about the
format, only the value. They just won't fit the new naming convention.

## Edge cases handled

- **Concurrent inserts**: advisory lock serializes same-day inserts.
- **Day boundary**: function uses Kuwait local date, so 00:00–02:59 UTC
  on day N+1 is treated as day N+1 in Kuwait (UTC+3). A permit
  created at 01:00 Kuwait local (22:00 UTC the previous day) gets
  the *current* Kuwait day's number.
- **Sequence exhaustion**: if 99 permits/passes are created in a single
  Kuwait day, the function raises a clear error rather than silently
  overflowing into 3 digits or wrapping. Per user assertion this
  cap will not be hit in practice.
- **Deletion gaps**: if `WP-260425-01` and `WP-260425-02` exist and
  `01` is deleted, the next allocator returns `03` (based on
  current MAX), not `01`. Numbers are *monotonic* but not contiguous
  after deletion. Acceptable.
- **Daylight savings**: Kuwait does not observe DST, so the
  `Asia/Kuwait` zone is UTC+3 year-round. No spring-forward / fall-
  back edge cases.

## Edge cases NOT handled

- **Manual rollback to a previous day**: if you change the system
  clock or someone manually sets `created_at` to yesterday, the
  function's "today" doesn't match. Out of scope.
- **Prefix conflicts with future schemes**: if you ever add a third
  artifact type (e.g. `MP-` for material permits), make sure its
  prefix doesn't collide with `WP-` or `GP-`. The functions match on
  exact prefix.

## Test plan

After deploy:

1. **Create a new permit** from the standard form. Open it. The
   permit number should be `WP-260425-01` (or `WP-260425-NN` where
   NN is the next sequence — depends on whether anything else has
   been created today).
2. **Create a gate pass.** Number should be `GP-260425-NN`.
3. **Submit a permit via the public portal** (the external requester
   form). Number should also start with `WP-` (no longer `INT-`).
4. **Send a permit back for rework, then resubmit it** as the
   requester. Resubmitted permit's number should be the original +
   `_V1`. Send back again, resubmit again — should be `_V2`.
5. **Late at night Kuwait local** (e.g. 01:30 AM Apr 26): create a
   permit. Number should be `WP-260426-01`, not `WP-260425-NN`.
6. **In a different time zone**: the Kuwait local date is what
   matters, not the user's browser timezone. Create a permit from
   a non-Kuwait timezone — it should still get the Kuwait-local-day
   number.
7. **Concurrency**: have two users submit permits within the same
   second. Both should succeed with sequential numbers.

If any test fails, paste the result and I'll diagnose.

## Rollback

```sql
DROP FUNCTION IF EXISTS public.next_permit_number_today();
DROP FUNCTION IF EXISTS public.next_gate_pass_number_today();
DROP FUNCTION IF EXISTS public.next_permit_number(date);
DROP FUNCTION IF EXISTS public.next_gate_pass_number(date);
ALTER TABLE public.gate_passes DROP CONSTRAINT IF EXISTS gate_passes_pass_no_key;
```

Then revert the frontend commits. Permits/passes created with the
new format keep their numbers — they're valid strings, just not in
the format the rolled-back generator would produce.

## Deployment

1. Apply the migration.
2. Rebuild the frontend bundle.

No edge function changes. No secrets. No new npm packages.
