# Phase 4b — Bilingual PDFs

> **CRITICAL:** I (the model that wrote this) cannot see the rendered
> PDFs. Arabic shaping and bidi behave correctly only when the font,
> the reshaper library, and the bidi library all work together in the
> Deno runtime. **The native Arabic reader on this team is the only
> person who can confirm the output is correct.** Test thoroughly
> before merging — see the test plan at the bottom.

## Scope

Adds bilingual headers and section titles to both PDF generators.
Free-text fields (work descriptions, comments, approver names,
addresses) remain in whatever language the user typed — those are
content, not chrome.

## What changed

### New: `supabase/functions/_shared/pdf-bilingual.ts` (~270 lines)

Shared helpers:

- **`loadArabicFont(pdfDoc)`** — fetches Noto Kufi Arabic regular +
  bold TTF from jsdelivr, registers `@pdf-lib/fontkit`, embeds as
  subsetted fonts. Caches the TTF bytes per cold start so subsequent
  invocations skip the ~400KB fetch. Returns `null` on any failure
  (network error, library missing, fontkit issue) — caller falls back
  to English-only rendering.

- **`shapeArabic(text)`** — async-loads `arabic-reshaper@1.1.0` and
  `bidi-js@1.0.3` from esm.sh on first use, runs the input through
  both. Falls back to identity (returns input unchanged) on any
  failure.

- **`drawArabic(page, text, x, y, opts)`** — combines shaping +
  drawing. Returns rendered width in points so callers can lay out
  adjacent elements. Defaults to right-anchor (Arabic reads RTL).
  Returns 0 on any failure (text not drawn rather than crashing).

- **`BILINGUAL_LABELS`** — curated translation map. ~60 entries
  covering document titles, status values, section headers,
  approver role labels, and common field labels. Both PDF
  generators source from this single map.

- **`arabicLabel(key)`** — convenience lookup, returns `null` for
  unknown keys.

### Modified: both PDF generators

- Import `loadArabicFont`, `drawArabic`, `arabicLabel` from `_shared/pdf-bilingual`.
- Load Arabic font alongside Helvetica during PDF init.
- `drawSectionHeader` becomes async and renders Arabic right-aligned
  on the same line as the English heading.
- All call sites of `drawSectionHeader` now `await`.
- Title block (WORK PERMIT / MATERIAL GATE PASS / etc.) renders the
  Arabic translation right-aligned on the same baseline as the
  English title (24pt / 20pt brand red).
- Column-pair headers (REQUESTER + CONTRACTOR, LOCATION + SCHEDULE,
  REQUESTOR + LOCATION & DETAILS) render Arabic at 8pt below each
  English heading (the columns are too narrow for inline placement).

### Specifically NOT changed

- **No layout shifts.** Field positions, page breaks, signature
  cells all unchanged. Only labels gained Arabic siblings.
- **Free-text fields.** Work descriptions, contractor names,
  comments, approver names — render in whatever language was typed.
  Mixing them with the bilingual chrome is the intended design.
- **Body labels** like "Name:", "Email:", "Date:". Skipped this
  pass — chrome was the visible win, body labels can land in 4c if
  desired.
- **Approval-status colors.** Green for approved, brand red for
  rejected. Unchanged.

## How the engineering pipeline works

When a Latin string is rendered in pdf-lib with Helvetica, glyphs
emerge naturally in left-to-right order. Arabic needs three
transformations:

1. **Cluster decomposition** — multi-character clusters (e.g. LAM +
   ALEF) map to specific ligature glyphs. Done by the reshaper.
2. **Contextual form selection** — Arabic letters take initial,
   medial, final, or isolated forms depending on neighbours. Also
   the reshaper.
3. **Bidi reordering** — visual order in the rendered output is
   right-to-left, but the underlying string is logical-order
   left-to-right. `bidi-js` walks the Unicode Bidirectional Algorithm.

Without all three, the output is glyph soup — disconnected letters
in wrong forms in wrong order. Each step is independently failable;
each has a fallback.

## What can go wrong (and how to spot it)

The PDF will render English correctly even if Arabic completely
fails. Watch for these failure modes when reviewing:

- **Empty Arabic.** Font fetch failed or fontkit didn't register.
  Symptom: chrome looks like the pre-4b PDF. Check edge function
  logs for "loadArabicFont failed" or "font fetch" errors.
- **Mojibake (boxes / question marks).** Shaping library imported
  but unable to map codepoints to glyphs. Symptom: Arabic line
  appears as small boxes or `?` symbols.
- **Disconnected letters in wrong forms.** Reshaper failed to load
  but text still drew. Symptom: each Arabic letter rendered as
  isolated form, words look broken apart. Look for "arabic-reshaper
  import failed" in logs.
- **Letters in wrong order (right side reads left-to-right).** Bidi
  failed but reshape worked. Symptom: words look right within
  themselves but the overall sentence direction is reversed. Look
  for "bidi-js import failed" in logs.
- **Latin numerals reversed inside Arabic.** Less obvious — usually
  means bidi worked but applied to numerals it shouldn't have.

## Risk assessment

This PR has more places to go wrong than any other in the project so
far. The shaping and bidi libraries' Deno compatibility is unverified
outside production deploy. The font URL is pinned but cdn outages
happen.

**The fallback design is conservative:** any single library failure
results in English-only output, not a broken PDF. So the worst case
for users is "no Arabic, but I can still generate a permit." The
worst case for *Al Hamra leadership* is "Arabic that looks wrong" —
which is what the test plan below targets.

## Deployment

Redeploy both edge functions:

- `generate-permit-pdf`
- `generate-gate-pass-pdf`

No migrations. No frontend. No secrets. The new `_shared/pdf-bilingual`
file deploys automatically with both functions because Supabase
bundles `_shared/` with each function.

Cold-start cost: ~400KB font fetch + ~30KB library imports the first
time each function instance handles a request. Subsequent requests
in the same instance reuse cached bytes.

## Test plan — please follow this carefully

You're a native Arabic reader and the only person on this team who
can verify the output is right. **The single most important test:**

1. **Generate a permit PDF on preview.** Open it.
2. Look at the title — "WORK PERMIT" should be on the left in red,
   and "تصريح عمل" (4 letters: ت ص ر ي ح، ع م ل with proper joining)
   should be on the right in red.
3. Look at the section headers (WORK DESCRIPTION, APPROVALS &
   SIGNATURES, ATTACHMENTS). Each should have Arabic on the right.
4. Look at the column headers (REQUESTER INFORMATION etc.). Arabic
   should be a smaller line below each English heading.
5. Check Arabic letters are properly connected and in correct form
   (no disconnected glyphs, no question marks, no missing characters).
6. Check the order of Arabic words is right (read RTL — first word
   is on the right).
7. Generate a gate pass PDF — same checks.

**If any Arabic looks wrong, do NOT merge.** Even one mangled label
on a leadership-facing artifact is worse than English-only.

If all looks correct: paste a screenshot or attach the rendered PDF
to the PR and merge.

## Rollback

If anything is wrong on production, revert the commit immediately.
The reverted PDFs return to English-only Phase 4a state (brand
applied but no Arabic). No data implications.

```bash
git revert <commit-sha>
git push origin main
```

## What's not in this PR (4c+)

- Body field labels (Name, Email, Date, From, To, Unit, Floor)
  bilingual — chrome was the visible win, these can come later.
- Approver role bilingual labels in the signature cells. The labels
  table includes them; wiring them into the cell layout is a future
  pass.
- A dedicated full-Arabic-only PDF for Arabic-first stakeholders.
- Date formatting in Arabic numerals (we use Western Arabic numerals
  per the brand spec).
