# Phase 5 — Email brand + bilingual

**Scope:** rewrites the HTML in `send-email-notification` to apply the
Al Hamra brand palette and add Arabic alongside English in every
notification email. Free-text fields (rejection reasons, rework
comments, requester names, work descriptions) render in whatever
language the user typed.

This PR is a counterpart to the bilingual PDF work in Phase 4b but
the engineering risk is much lower. **Email clients (Outlook, Gmail,
Apple Mail) handle Arabic shaping and bidi natively** — there's no
font to embed, no shaping library, no Deno runtime risk. The only
plumbing required is `dir="rtl" lang="ar"` on the right HTML elements.

## What changed

One file: `supabase/functions/send-email-notification/index.ts`
(330 → 415 lines).

### Brand palette

The previous template used a varied vibrant palette
(`#3b82f6 #f59e0b #22c55e #ef4444 #8b5cf6 #6b7280`) that didn't
relate to the rest of the product. Replaced with a brand vocabulary:

```ts
const BRAND_RED  = "#CD1719";  // primary identifier; rejected/breach
const BRAND_DARK = "#1D1D1B";  // body text
const BRAND_GREY = "#B2B2B2";  // borders, dividers
const SUCCESS    = "#22a34a";  // approved
const WARNING    = "#d97706";  // SLA warning, rework, awaiting approval
const INFO       = "#1d6fdb";  // submitted, status update
const NEUTRAL    = "#4b5563";  // closed, archived
```

Semantic distinctions are preserved (success = green, danger = red,
warning = amber) so users still scan the inbox and see at a glance
what kind of email it is. But the values come from a brand-aligned
vocabulary.

### Specific application points

- **Title strip** — semantic accent color background (e.g. brand
  red for `rejected`, green for `approved`). White text. Now shows
  English title above Arabic title.
- **CTA button** — was per-template color, now always `BRAND_RED`.
  Consistent identifier across all email types.
- **Permit details box** — gained a 3px brand-red left border for
  visual consistency with the in-app "highlighted" treatment.
- **Logo header** — bottom border was `#e5e7eb`, now `BRAND_GREY`.
- **Footer** — top border now `BRAND_GREY`; text reorganized for
  bilingual.

### Bilingual content

Every notification template now has paired EN/AR strings. Layout is
**stacked**: English block on top of Arabic block within a single
card. Both audiences get the message in one email.

- Title: English (20px white) above Arabic (18px white, `dir="rtl"`).
- Body content: English paragraph followed by Arabic paragraph
  (`dir="rtl" lang="ar"`).
- Permit details labels (Work Type, Requester, Priority): each
  label shows "English · Arabic" inline so the structure stays
  compact.
- CTA: primary "View Permit Details" button in English, with
  smaller Arabic link "عرض تفاصيل التصريح" below.
- Footer: English message + Arabic translation.

10 notification types covered:
`new_permit, approval_required, approved, rejected, rework,
forwarded, closed, sla_warning, sla_breach, status_update`

### Font stacks

```ts
const FONT_LATIN  = "'Jost', -apple-system, …, Arial, sans-serif";
const FONT_ARABIC = "'Noto Kufi Arabic', 'Geeza Pro', 'Damascus', …";
```

Email clients are pickier about fonts than browsers. `Jost` and
`Noto Kufi Arabic` will load on clients that respect web fonts
(Apple Mail, Outlook with custom fonts enabled). Other clients fall
back through the system stack — the email still looks clean, just
with the system Arabic font instead of Noto Kufi.

## Why this PR is safer than 4b

The PDF bilingual work (4b) had a real risk: pdf-lib doesn't natively
shape Arabic, so we shipped a server-side pipeline (font embed,
arabic-reshaper, bidi-js) that was unverifiable from where I write
this code.

Email is HTML. Arabic shaping and bidi reordering happen **in the
recipient's email client** — Outlook, Gmail, Apple Mail, all major
mobile clients have native Arabic typography support. As long as the
HTML has the right `dir="rtl"` attributes and a fallback Arabic font
stack, the rendering is the email client's responsibility.

So the failure modes are:

- **Worst case:** the Arabic font doesn't load and the recipient sees
  Arabic in their system default Arabic font. Not pretty, but
  legible.
- **Worse worst case:** an old email client that doesn't honor
  `dir="rtl"`. The Arabic text will be left-aligned but still readable
  because the client still does its own bidi reordering of the
  underlying characters.

There's no equivalent of "PDF shows mojibake / disconnected glyphs"
here.

## Things NOT bilingual

- **Free-text fields**: rejection reasons, rework comments,
  requester names, work descriptions, contractor companies, etc.
  These render in whatever language the user typed in the app. No
  attempt to translate user content.
- **Error messages**: the function's own error strings (rate-limit
  exceeded, etc.) stay English. Those go to logs / 4xx responses,
  not to email recipients.
- **`statusMessage` for `status_update`**: if a caller passes
  `details.statusMessage` it appears in the English block; for the
  Arabic block, callers can pass `details.statusMessageAr` if they
  want to localize. Default Arabic fallback is provided.
- **Subject line**: passed in by the caller (the back end that
  triggered the email). Subject line bilingual is a future change
  in whoever calls this function.

## Deployment

Redeploy a single edge function: `send-email-notification`.

No migrations, no secrets, no frontend changes, no new packages, no
other edge functions affected.

## Test plan

For each of the 10 notification types, send a test email to a
recipient and verify in **Outlook** (web + mobile), **Gmail** (web +
mobile), and **Apple Mail**:

1. Title strip color matches the notification type's semantic intent
   (red for rejected/breach, green for approved, amber for warning,
   blue for info, grey for closed).
2. English title shows correctly above Arabic title.
3. English content paragraph reads correctly.
4. Arabic paragraph follows below, **right-aligned**, letters
   properly connected (Arabic shaping handled by the email client).
5. Permit details box (when included) shows "Work Type · نوع العمل"
   etc. with correct values.
6. CTA button renders in brand red, sends to correct permit URL.
7. Footer shows both English and Arabic.

The single most important test: **send one of each notification
type** and check both English and Arabic blocks render. Worst
finding would be that some Arabic gets rendered as Arabic text in
the wrong direction, which is rare on modern email clients but worth
verifying.

## Rollback

Revert the commit. The previous English-only single-language
template returns. No data loss path.

## Dependencies on other phases

- **Phase 3** (i18n foundation): independent. This PR doesn't read
  from `i18next`; the translations are inline in the function for
  performance and simplicity. If we ever want to drive these from
  the same source as the web app, that's a future refactor.
- **Phase 4a/4b** (PDF brand + bilingual): independent. Different
  artifact, different rendering pipeline.
- **Phase 2c-* (approvals refactor)**: independent. Email body is
  composed from the notification type and a small details payload.

## Possible follow-ups

- **Single-language-per-recipient mode**: if every user has a
  language preference stored, we can render only EN or only AR
  per recipient. Cuts email height in half. Requires plumbing the
  user's language through every caller of this function. Worth
  doing later, not now.
- **Subject line bilingual**: currently the caller decides the
  subject. A wrapper that takes a notification type and produces
  a "EN | AR" subject would be nice but requires touching every
  caller.
- **Pluralizations / variable substitutions in Arabic**: Arabic has
  more grammatical agreement requirements than English. The current
  templates dodge this by avoiding constructions that need agreement.
  If the templates grow, a lightweight i18n setup may become worth
  it.
