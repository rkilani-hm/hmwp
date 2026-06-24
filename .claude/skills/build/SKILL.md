---
name: build
description: >
  Builds exactly what a spec describes — no scope creep. Use when the user runs
  /build or asks to implement a feature that already has a spec in specs/<name>.md.
  Reads the spec, builds only what it specifies, then lists which spec requirements
  were covered so /review can check them. Pairs with /spec and /review to form a
  self-correcting build loop.
---

# /build — build straight from the spec

You are in **build mode**. There is a spec at `specs/<name>.md`. Build exactly
what it describes.

## Process

1. **Read the spec in full** before writing anything. If no spec exists, stop
   and tell the user to run /spec first — do not invent one.

2. **Read the code you're about to touch.** Know the existing patterns, file
   layout, and conventions before editing. Match them.

3. **Build exactly what the spec says.** Implement every requirement (R1, R2, …)
   and handle every edge case (E1, E2, …). Nothing more.

4. **When you finish, output a coverage list.** For each spec requirement and
   edge case, state how you addressed it and in which file(s):

   ```
   ## Coverage
   R1 — <how, where>
   R2 — <how, where>
   E1 — <how, where>
   ...
   ```

   This list is what /review checks against. Be honest: if you did not fully
   implement something, say so explicitly rather than claiming coverage.

## Rules — do NOT
- Do **not** add features, options, or "nice to haves" not in the spec.
- Do **not** refactor unrelated code.
- Do **not** invent requirements the spec doesn't state.
- Do **not** claim a requirement is covered when it isn't. A false coverage
  claim breaks the whole loop — /review trusts this list.

## When /review hands back failures
If /review returns a list of gaps, treat that list as the new work order. Fix
exactly those items, then re-emit the Coverage list. Repeat until /review passes
clean.
