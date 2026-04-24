# Phase 3a — Al Hamra brand palette + i18n foundation

**Status:** foundation only. No UX changes in this phase — just colors,
fonts, and the infrastructure needed to serve the app in English and
Arabic. UX fixes land in Phase 3b. Reader switch lands in Phase 3c.
Bilingual PDFs land in Phase 3d.

## What this phase changes

### Brand palette (src/index.css + tailwind.config.ts)

Replaces the generic navy-and-teal Lovable template palette with the
Al Hamra brand colors from the Identity Guidelines:

| Role | Hex | HSL |
| --- | --- | --- |
| Primary red — CTAs, focus ring, brand identifier | `#CD1719` | `0 80% 45%` |
| Sub-grey — borders, dividers | `#B2B2B2` | `0 0% 70%` |
| Charcoal — text only, never in large fills | `#1D1D1B` | `60 3% 11%` |
| Light grey — surfaces, muted backgrounds | `#EDEDED` | `0 0% 93%` |

Heavy black is deliberately avoided per brand direction. Backgrounds are
white, the sidebar is white with red accents (was navy), and shadows use
a warm `hsl(60 3% 11%)` tint rather than pure black.

### Fonts

Swapped from Inter + Outfit to:

- **Jost** (English) — geometric, close to Century Gothic which is the
  brand's English face. Century Gothic itself requires a commercial web
  license; Jost is the free equivalent. One-line swap in `src/index.css`
  if you license Century Gothic later.
- **Noto Kufi Arabic** (Arabic) — geometric Kufi matching the character
  of Ge Flow, the brand Arabic face. Same substitution rationale.

Both load from Google Fonts.

### i18n infrastructure

Three new files plus two modified ones:

- `src/i18n/config.ts` — `i18next` + `react-i18next` setup. English is
  the default per the user's direction. User preference persists to
  `localStorage` under key `hmwp.language`. Missing-key fallback is
  English so new features ship without complete Arabic translation.
- `src/i18n/en.json` — canonical English string catalog (~130 keys).
- `src/i18n/ar.json` — inline Arabic translations. Procedurally-sensitive
  strings are marked `/* AR: TODO — review */` for verification by a
  fluent reviewer before production.
- `src/contexts/LanguageContext.tsx` — provider that listens for language
  changes and flips `<html dir>` between `ltr` and `rtl`. All Tailwind
  logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`) and the
  `[dir="rtl"]` rules in `index.css` respond automatically.
- `src/components/LanguageToggle.tsx` — two-button toggle rendered in
  Settings.

### How to use in components

```tsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation();
  return <button>{t('common.submit')}</button>;
}
```

For Latin numerals inside Arabic prose (permit numbers, dates, amounts),
wrap the element in a `<span className="numeric">` or use `<time>`. The
CSS in `index.css` forces LTR direction and the Latin font for those.

## Dependencies added

```json
"i18next": "^23.15.1",
"i18next-browser-languagedetector": "^8.0.0",
"react-i18next": "^15.0.2"
```

Lovable needs to run install after pulling this branch.

## Deployment

Order does not matter — this is a pure client change.

1. Apply branch changes.
2. Install dependencies.
3. Deploy frontend bundle.
4. No migrations. No edge function changes. No secrets.

## What to test

1. Open the app on a fresh browser. Default language should be English.
2. Settings → Language → tap "العربية". The entire UI should flip to
   RTL, switch to Noto Kufi Arabic, and translate labels.
3. Permit numbers (e.g. `WP-2026-00123`) must still read left-to-right
   in Arabic mode. Dates likewise.
4. Reload the page — language preference should persist (localStorage).
5. Return to English — direction flips back, fonts return to Jost.

## Known gaps (fixed in later phases)

- Most pages still contain hardcoded English strings. They will be
  replaced with `t()` calls incrementally in Phase 3b as each component
  is reviewed. For now, Arabic mode translates the chrome (nav, buttons,
  errors, settings) but detail pages show English text until touched.
- PDFs are still English-only. Bilingual PDFs land in Phase 3d.
- Work types, role labels, and status labels are sourced from the DB and
  will get `name_ar` columns in Phase 3c/3d.
