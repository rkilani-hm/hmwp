# Phase 4a — PDF brand application

**Scope:** apply the Al Hamra brand palette to the existing two PDF
generators (`generate-permit-pdf`, `generate-gate-pass-pdf`). Layout,
copy, language, and structure are all unchanged. Just the colors.

Bilingual EN/AR PDFs are deferred to Phase 4b. Doing them well requires
embedding an Arabic-shaping-capable font and running text shaping
through a library like `arabic-reshaper` + `bidi-js` — substantial
engineering that deserves its own focused PR. Phase 4a doesn't compete
with that.

## What changed

Two edge functions, ~30 lines added to each, ~20 changed.

### `BRAND` constants block at the top of each file

```ts
const BRAND_RED   = rgb(0.804, 0.090, 0.098);  // #CD1719 — primary identifier
const BRAND_GREY  = rgb(0.698, 0.698, 0.698);  // #B2B2B2 — borders, dividers
const BRAND_DARK  = rgb(0.114, 0.114, 0.106);  // #1D1D1B — body text
const BRAND_LIGHT = rgb(0.929, 0.929, 0.929);  // #EDEDED — surface fills
```

These mirror the tokens in `src/index.css`. Future palette tweaks
happen here in two files, not scattered across hundreds of inline
`rgb(…)` calls.

### Two helpers per file

- `drawBrandLine(page, y)` — thicker (1.5pt) brand-red horizontal
  line. Used as a major divider after the title block.
- `drawSectionHeader(page, text, y, size)` — draws the section title
  in brand-red bold, followed by a thin brand-grey hairline below
  it. Used for major section breaks (`WORK DESCRIPTION`,
  `APPROVALS & SIGNATURES`, `ATTACHMENTS`, etc.).

### Specific application points

**Permit PDF:**
- "WORK PERMIT" title (24pt) → brand red
- Permit number subtitle (16pt) → brand dark
- Brand-red divider after the title block
- Section headers (WORK DESCRIPTION, APPROVALS & SIGNATURES,
  ATTACHMENTS) → `drawSectionHeader` (red text + grey hairline)
- Column-pair headers (REQUESTER INFORMATION + CONTRACTOR
  INFORMATION, LOCATION + SCHEDULE) → brand red text only (no
  hairline so the two columns remain visually paired)
- Body text "Work Type: …" → brand dark
- Rejected status badge — was `rgb(0.86, 0.21, 0.27)` (slightly off-brand
  red), now `BRAND_RED` for consistency
- Approval row "rejected" indicator — same change

**Gate pass PDF:**
- "MATERIAL GATE PASS" / "PERSONNEL GATE PASS" / etc. (20pt) → brand red
- Pass number subtitle (14pt) → brand dark
- Brand-red divider after the title block
- Section headers (TRANSFER SCHEDULE, ITEM DETAILS, PURPOSE OF
  MATERIAL SHIFTING, APPROVALS & SIGNATURES) → `drawSectionHeader`
- Column headers (REQUESTOR INFORMATION + LOCATION & DETAILS) → brand red
- "Type: …" body text → brand dark
- High-value asset warning text → unified to `BRAND_RED`
- "NOTE: Materials shifting using forklift…" warning → `BRAND_RED`

### Specifically NOT changed

- Approval-status green (still `rgb(0.13, 0.77, 0.37)`) — semantic
  approval color separate from the brand palette. Keeping it green
  matches user expectation.
- Page background, body text default (still black for legibility on
  white).
- Logo position, size, source. Still pulls `company-logo.jpg` from
  the `company-assets` bucket.
- Fonts. Still using pdf-lib's bundled Helvetica.
- Layout, copy, language, content. The brand red replaces a few
  black titles and unifies a few off-brand reds — that's it.
- Bilingual content. English-only as before. Arabic comes in 4b.

## What this does NOT do

- **No Arabic content.** Phase 4b.
- **No font swap.** Helvetica → Jost would require shipping the Jost
  TTF in the function bundle. Tradable for ~30KB of bundle size if
  you want a closer match to the on-screen fonts later.
- **No layout changes.** Same field positions, same page breaks.
- **No new sections, no removed sections.**
- **No change to the PDF data sources.** Phase 2c-3 readers stand.

## Deployment

Redeploy both edge functions:
- `generate-permit-pdf`
- `generate-gate-pass-pdf`

No migration. No frontend change. No secrets. No new packages.

## Testing

1. Generate a permit PDF for any permit. The "WORK PERMIT" title
   should now be in Al Hamra red. Section headers (WORK DESCRIPTION,
   APPROVALS & SIGNATURES, ATTACHMENTS) should be red with a thin
   grey underline.
2. Generate a gate pass PDF. Same treatment for the title and
   sections.
3. Compare against a recent pre-Phase-4a PDF for the same artifact.
   Layout should be identical — only colors differ.
4. Verify approved/rejected status badges still read correctly:
   green for approved, brand red for rejected.

## Rollback

Revert the commit. Function bodies return to their previous color
palette. No data implication.

## Phase 4b preview

Phase 4b will:
- Embed Noto Kufi Arabic TTF in the function bundle
- Add an `arabic-reshaper` + `bidi-js` text-shaping pipeline
- Render bilingual content for headers and field labels (EN above,
  AR below, or side-by-side depending on space)
- Free-text fields (work descriptions, comments) render in whatever
  language the user typed
- Signature attribution (approver name, role) bilingual where the
  role has both EN and AR labels in the `roles` table

That's a substantial PR (~400-500 lines) and worth its own focused
review. Not bundled with this brand-only pass.
