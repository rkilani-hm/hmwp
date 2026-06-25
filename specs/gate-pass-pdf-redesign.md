# Spec: Redesign Gate Pass PDF to match the Work Permit design (content stays GP)

## Objective
Restyle the Gate Pass PDF (`generate-gate-pass-pdf`) so its visual design matches
the Work Permit PDF (`generate-permit-pdf`) — same brand system, section banners,
field grids, bilingual EN/AR handling, doc-ID strip, footer/QR, and especially
the **Approval Chain** section. The Gate Pass CONTENT stays GP-specific (no WP
content added). Two concrete changes drive this:
  (1) REMOVE the "Department Verification" block (manual Approved By / FMSP
      name/department/date/sign table) at the bottom of the GP PDF.
  (2) REPLACE it with a WP-style "Approval Chain" section sourced from
      `gate_pass_approvals`, rendered identically to the WP approval chain
      (numbered rows, role EN+AR, approver name + timestamp, status pill,
      embedded signature).
And overall, bring the rest of the GP PDF up to the WP's look.

## Authoritative design reference (from live `generate-permit-pdf` on main)
The WP generator defines a reusable design system the GP must adopt:
- A4 595.28×841.89, margin 22.
- Brand constants: BRAND_RED rgb(.804,.090,.098), BRAND_GREY, BRAND_DARK
  rgb(.114,.114,.106), BRAND_LIGHT; SECTION_BAR_INK rgb(.102,.102,.102) (black
  section banner), SUBSECTION_BAR_INK rgb(.478,.082,.094) (burgundy subsection
  banner), WHITE.
- Bilingual helpers from `../_shared/pdf-bilingual.ts`: `loadArabicFont`,
  `drawArabic`, `arabicLabel`. Arabic font load is async with English-only
  fallback on failure.
- Helper components: `drawSectionHeader` (black banner, EN left + AR right),
  `drawSubsectionHeader` (burgundy numbered banner), `drawField` (grey EN label
  + AR + underlined value), `drawDocIdStrip` (4-cell top strip),
  `sanitizeWinAnsi`/`drawText`, `truncateForWidth`.
- Title block: Arabic title (26pt) + "… Form" (20pt bold) + doc number (14pt red)
  + brand line; company logo top-right; QR + footer drawn on every page.
- Approval chain row layout (Section B): per-row colored status dot + 2-digit
  number, EN role (bold) over AR role, approver name + datetime, status pill
  (APPROVED green rgb(.086,.396,.204) / REJECTED brand-red / PENDING burgundy
  with halo / AWAITING grey), embedded signature image or dashed
  "PENDING SIGNATURE" placeholder, row separators, page-break handling.

## Requirements

R1. **Adopt the shared design system in the GP generator.** Refactor
    `generate-gate-pass-pdf` to use the SAME brand constants, `pdf-bilingual.ts`
    helpers, and the section/subsection/field/doc-id-strip/footer/QR helpers as
    the WP generator. Prefer EXTRACTING the shared drawing helpers into a shared
    module (e.g. `../_shared/pdf-layout.ts`) imported by BOTH generators, so the
    two PDFs cannot visually drift again. If extraction is too invasive for this
    pass, replicate them faithfully in the GP generator and note the duplication
    as tech debt — but extraction is preferred.

R2. **Header / title block to match WP.** GP page 1 uses the same chrome: company
    logo top-right, bilingual title ("Material Gate Pass" / Arabic), GP number in
    brand red, brand line, and a doc-ID strip (e.g. Gate Pass No. / Pass Type /
    Date / Issued). Keep the GP title and GP-specific doc-ID cells — do NOT
    relabel it "Work Permit".

R3. **Keep ALL GP-specific content, restyled.** Preserve and restyle into the WP
    field-grid / section language every GP section that exists today, including:
    Material Entry / Material Exit / Internal Shifting selection; Requestor /
    Client / Contractor / Unit / Email / Contact; Transfer Schedule (From/To
    dates); Time From / To; the items table (SR / Details / Quantity / Remarks);
    Location; Shifting Method (Manually / Material Trolley / Pallet Trolley /
    Forklift); Purpose of Material Shifting. No GP content is dropped. (Note:
    Time From/To and Shifting Method capture/rendering correctness is a SEPARATE
    spec; here, render whatever the GP currently stores, in the new style.)

R4. **REMOVE the Department Verification block.** Delete the bottom manual
    signature table ("Approved By: AlHamra" / "FMSP" with Name/Department/Date/
    Sign cells) from the GP PDF entirely.

R5. **ADD a WP-style Approval Chain section** in its place, sourced from
    `gate_pass_approvals` (the GP equivalent of `permit_approvals`). Render it
    with the SAME row layout, status colors, EN+AR role names, approver name +
    timestamp, status pills, embedded signatures, page-break handling, and the
    "SECTION … APPROVAL CHAIN" black banner + burgundy "1. Approval Chain"
    subsection bar as the WP. Build a GP role display-name map (EN + AR) for the
    gate-pass workflow roles, mirroring WP's ROLE_DISPLAY_NAMES /
    ROLE_DISPLAY_NAMES_AR / ROLE_RENDER_ORDER, using the actual gate-pass role
    keys.

R6. **Bilingual + sanitization parity.** Arabic labels via `arabicLabel` /
    `drawArabic`; English-only graceful fallback if the Arabic font fails to
    load; all Latin text routed through `sanitizeWinAnsi`. Match WP behavior.

R7. **Footer / QR parity.** Same footer (divider, "official document" line,
    "Generated on …"), page numbering, and QR (pointing to the GP verification
    URL via `HMWP_BASE_URL`) on every page, as the WP generator.

R8. **No behavioral/auth changes.** Keep the GP generator's existing auth, rate
    limiting, tenant-visibility rules, storage upload, and signed-URL behavior
    unchanged. This is a presentation change only.

## Edge cases
E1. Arabic font fails to load → GP renders English-only, no crash (parity with
    WP fallback).
E2. `gate_pass_approvals` empty or partially pending → approval chain renders all
    rows with correct PENDING/AWAITING styling (first-pending gets halo), exactly
    like WP.
E3. Missing/!image signature → dashed "PENDING SIGNATURE" placeholder.
E4. Approval chain longer than one page → page-break + "(continued)" subsection
    bar, like WP.
E5. GP role keys that have no display-name mapping → fall back to humanized
    role_name (replace _ , title-case), as WP does.
E6. Long item lists / long Purpose text → wrap/clip consistent with WP field and
    text handling; multi-page if needed with section headers repeated.
E7. Company logo missing → render without it (parity).

## Definition of done
- [ ] GP PDF no longer contains the Department Verification block.
- [ ] GP PDF shows a WP-identical Approval Chain section sourced from
      `gate_pass_approvals` (numbered rows, EN+AR roles, approver+timestamp,
      status pills, signatures, halo on first pending), verified by generating a
      GP with at least one approved + one pending step (e.g. an existing GP).
- [ ] GP header/title/doc-ID strip/section banners/field grids visually match the
      WP design; GP title is "Material Gate Pass" (NOT "Work Permit"), and the
      in-app/nav header for GP screens does not read "WorkPermit".
- [ ] All existing GP content sections are present and restyled (none dropped).
- [ ] Bilingual EN/AR parity with English-only fallback; QR + footer + page
      numbers on every page.
- [ ] Auth, rate limit, tenant visibility, storage upload, signed URL unchanged.
- [ ] If shared helpers were extracted: BOTH `generate-permit-pdf` and
      `generate-gate-pass-pdf` import them and the WP PDF still renders
      identically (no WP regression) — verify by regenerating a WP.
- [ ] `deno check` passes on the edited function(s); a real GP PDF generates
      without error.

## Out of scope (separate specs)
- Correctness of Time From/To and Shifting Method CAPTURE (form → DB → PDF data
  flow) — that is the Gate Pass form-fidelity spec, not this redesign.
- Any change to the gate-pass approval WORKFLOW logic.

## Deployment note (outside the loop)
This edits the `generate-gate-pass-pdf` edge function (and possibly
`generate-permit-pdf` if helpers are extracted). Both must be DEPLOYED to
Supabase (a repo merge alone does not deploy edge functions). If helpers are
extracted, deploy BOTH together to avoid a broken shared import. Generate one
real GP and one real WP after deploy to confirm parity and no regression.
