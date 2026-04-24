# Phase 3c-2 — PermitFormWizard split

**Scope:** architectural refactor of the create-permit flow. Behavior
unchanged. The 635-line `PermitFormWizard.tsx` monolith is decomposed
into a thin orchestrator plus five step components, each individually
readable.

No API changes. No migrations. No new deps. Pure client refactor.

## Before

One file, 635 lines, containing:
- step-state + navigation + animation + validation
- five `{currentStep === N && ( ...JSX... )}` blocks with inline labels
- data fetches, submission, field-update helpers, file handlers
- hardcoded English strings throughout

Any change to one step required scrolling through the other four.

## After

```
src/components/forms/
├── PermitFormWizard.tsx                # shell, 272 lines
└── permit-steps/
    ├── types.ts                         # PermitFormData, UpdateField,
    │                                    # canProceedFromStep validator
    ├── RequesterStep.tsx                # 74 lines
    ├── WorkDetailsStep.tsx              # 158 lines
    ├── ScheduleStep.tsx                 # 122 lines
    ├── DocumentsStep.tsx                # 89 lines
    └── ReviewStep.tsx                   # 130 lines
```

The shell owns:
- step state + navigation
- form state + updateField
- data fetches (work types, locations)
- submission
- progress bar + footer nav

Each step component owns:
- its own JSX and labels
- its own placeholder text (translated)
- its own RTL/direction handling for free-text vs LTR-only fields

Shared validation (`canProceedFromStep`) lives in `types.ts` and is
imported by both the shell (to disable Next) and, in future phases,
by any component that wants to show inline validation errors.

## User-visible improvements

Even though this is a refactor, a handful of small UX improvements
slipped in because they were obvious while handling each step:

- **Mobile footer** — Previous / Next stack on narrow screens
  (`flex-col-reverse sm:flex-row`) with full-width tap targets instead
  of two squashed buttons.
- **Full i18n** — every label, placeholder, description, button now
  routes through `t()`. Arabic translations added inline for the whole
  form.
- **RTL-aware direction** — free-text fields (names, descriptions,
  locations) use `dir="auto"` so they render correctly whether the user
  types Arabic or English. Numeric / email / phone fields pinned `dir="ltr"`.
- **End-date validation hint** — the end-date input now has `min` tied
  to the start-date, so the browser date picker respects it. (Pure
  polish — server validation is authoritative.)
- **Stable file list keys** — `key={`${file.name}-${index}`}` instead
  of bare index, so re-ordering doesn't glitch the animation.
- **Accessibility** — remove-file button now has an `aria-label`, the
  progress bar announces `aria-current="step"`, step icons are
  `aria-hidden="true"`.
- **Pluralized attachment count** — `{{count}} file / files` via
  i18next plural rules, including Arabic's dual and few/many forms.

## Deployment

1. Pull branch.
2. Build and deploy frontend bundle.

No secrets, no migrations, no edge functions, no new npm packages.

## Testing

From a phone, ideally:

1. New permit → complete all five steps in English → submit → confirm
   permit appears in My Permits.
2. New permit → switch to Arabic mid-flow → labels translate, layout
   flips RTL, free-text fields accept Arabic input.
3. Step 3 → toggle Urgent — red highlight replaces blue; summary (step
   5) shows the right badge.
4. Step 4 → attach 2 files → go Back to step 3 → Next again → files
   still there.
5. Submit from step 5 → loading state on button → navigates to
   /permits on success.
6. Previous button at step 1 is disabled.
7. Next button is disabled until required fields fill.

## Leftover opportunity (not in this PR)

`src/components/forms/GatePassFormWizard.tsx` is 413 lines and would
benefit from the same split. Deferred — would double the review
surface and the gate-pass flow has its own quirks (high-value assets,
CCTV confirmation) that deserve a focused pass.
