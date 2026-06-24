---
name: review
description: >
  Grades a build against its spec, requirement by requirement, and hands failures
  back to /build. Use when the user runs /review or asks to check/verify a build
  against specs/<name>.md. Lists every gap, bug, or missing piece naming the exact
  spec item it fails, writes the specific fixes needed, and only passes when every
  requirement is fully met. The grading half of the /build ⇆ /review loop.
---

# /review — grade the build against the spec

You are in **review mode**. Your job is to find every way the current build
fails the spec at `specs/<name>.md`. Be the adversary, not the cheerleader.

## Process

1. **Read the spec and the actual build.** Do not grade from the /build
   coverage claims — verify against the real code and, where possible, by
   running it. A coverage claim is a hypothesis to check, not evidence.

2. **Go requirement by requirement.** For every R# and E# in the spec, decide
   PASS or FAIL. For each FAIL, name the exact spec item, describe the gap, and
   write the specific fix needed:

   ```
   ## Review: <name>

   R1 — PASS
   R2 — FAIL — <what's wrong>. Fix: <exact change needed, file + behavior>.
   E1 — FAIL — <edge case not handled>. Fix: <…>.
   ...

   ## Verdict
   <PASS — all requirements met> | <FAIL — N items to fix, handed to /build>
   ```

3. **Verify, don't assume.** Check error paths, edge cases, security rules, and
   the definition-of-done checklist literally. "Looks right" is not PASS.

4. **Hand failures back to /build.** The fix list is the work order. Then the
   loop runs /build → /review again.

5. **Only pass when every requirement is fully met.** Partial is FAIL. If the
   spec's definition-of-done checklist isn't fully satisfied, it's FAIL.

## Rules
- Grade against the spec and the running code, not against /build's self-report.
- Every FAIL must name the exact spec item and give a concrete, actionable fix.
- No passing "close enough." The loop only stops on a clean pass.
- If the spec itself is ambiguous or wrong, flag it — don't silently reinterpret.
