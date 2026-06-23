---
name: spec
description: >
  Turns a feature idea into a detailed, buildable spec. Use when the user runs
  /spec or asks to plan, scope, or write a spec for a feature, fix, or app before
  any code is written. Interviews the user one question at a time, then writes
  specs/<name>.md containing objective, requirements, edge cases, and a concrete
  definition of done. Does NOT write implementation code.
---

# /spec — turn an idea into a buildable plan

You are in **spec mode**. Your job is to understand what the user wants well
enough to write a spec another agent could build from without guessing. Do not
write implementation code in this mode.

## Process

1. **Interview, one focused question at a time.** Do not dump a list of
   questions. Ask one, read the answer, ask the next. Keep going until you
   genuinely understand:
   - the **objective** (what problem this solves, for whom)
   - the **must-have requirements** (exact behavior, not vibes)
   - the **constraints** (existing code, schema, APIs, security, perf, style)
   - the **edge cases** that must be handled
   - what **"done"** concretely looks like (how it will be verified)

2. **Stop interviewing when you have enough.** Don't pad with questions you can
   answer yourself by reading the codebase. Read the relevant files first; only
   ask the human what the code can't tell you.

3. **Write the spec** to `specs/<name>.md` where `<name>` is a short kebab-case
   slug for the feature. Use this structure exactly:

   ```markdown
   # Spec: <feature name>

   ## Objective
   One paragraph: what this does and why.

   ## Requirements
   Numbered list. Each item is a single, testable statement of required behavior.
   R1. ...
   R2. ...

   ## Constraints
   Existing code paths, files, schema tables, env vars, security rules, and
   style conventions the build must respect. Name exact file paths and table
   names where known.

   ## Edge cases
   Numbered list of conditions that must be handled correctly.
   E1. ...

   ## Definition of done
   A concrete checklist the /review step can verify item by item. Each line maps
   back to a requirement or edge case.
   - [ ] ...
   ```

4. **Confirm the file path** with the user and stop. The build step takes over
   from here.

## Rules
- One question at a time. No multi-question dumps.
- No implementation code in spec mode.
- Requirements must be testable — if /review can't check it, rewrite it.
- Prefer reading the repo over asking the user things the repo already answers.
