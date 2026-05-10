# User manual screenshots

Drop PNG screenshots of the live app pages here. They become user-manual
illustrations on the `/user-manuals` page.

## How it works

Each screenshot in this folder is served at `/manuals/<filename>` —
e.g. `permit-form-step-1.png` here is reachable in the browser as
`https://hmwp.lovable.app/manuals/permit-form-step-1.png`.

To wire a screenshot into the manual page, find the matching
`<ScreenshotPlaceholder>` call in `src/pages/UserManuals.tsx` and add
the `imageSrc` prop pointing to it. Until you do, the call site
shows the dashed placeholder card with the description text — the
manual stays usable while you fill in screenshots over time.

```tsx
// Before (placeholder showing)
<ScreenshotPlaceholder
  step={1}
  title="Click 'New Permit' button"
  description="The button is in the top-right corner of the dashboard."
/>

// After (real screenshot showing)
<ScreenshotPlaceholder
  step={1}
  title="Click 'New Permit' button"
  description="The button is in the top-right corner of the dashboard."
  imageSrc="/manuals/dashboard-new-permit-button.png"
/>
```

If the file goes missing later (typo in path, deleted by accident),
the component automatically falls back to the placeholder rather
than showing a broken image icon.

## Naming convention

Use kebab-case, descriptive, scoped by the section they belong to:

```
internal-dashboard.png
internal-permit-form-step-1.png
internal-permit-form-step-2.png
internal-permit-list.png
internal-permit-detail.png

client-public-form.png
client-status-lookup.png

approver-inbox.png
approver-permit-detail.png
approver-approval-dialog.png
approver-rework-dialog.png

admin-user-list.png
admin-workflow-builder.png
admin-work-types.png

gate-pass-form.png
gate-pass-detail.png
gate-pass-pdf.png
```

Prefix each file with the manual section it belongs to (`internal-`,
`client-`, `approver-`, `admin-`, `gate-pass-`) so the folder stays
browsable when there are 30+ screenshots.

## Format and size

- **Format:** PNG. JPEG works too but PNG handles UI graphics with
  text more cleanly.
- **Width:** target around 1280px wide for desktop screenshots.
  Larger is fine — they're served as-is and the browser scales them
  in the layout. Keep individual files under ~500 KB if possible.
- **Mobile screenshots:** for screens that look meaningfully
  different on mobile, capture both. Suffix the mobile variant with
  `-mobile.png` (e.g. `client-public-form-mobile.png`).
- **Annotations:** if you mark up the screenshot (red arrows, boxed
  highlights), do that in your editing tool before saving. The
  manual page shows the image as-is.
- **Privacy:** strip any real user data, real permit numbers from
  outside testing, real personal data, or sensitive contractor info
  before saving. Use mock data — the test permits we made for the
  testing-phase rollout (WP-260426-NN style) are good candidates.

## How to capture screenshots

Quick options that work without extra tools:

- **macOS:** Cmd+Shift+4 then Space then click a window — captures
  just that window with shadow. Save as PNG.
- **Windows:** Win+Shift+S to open the snipping tool. Choose
  Window or Region.
- **Browser DevTools (any OS, lossless):** Cmd/Ctrl+Shift+P then
  type "Capture full size screenshot" — useful for capturing a
  scrollable page top-to-bottom.

If you want consistency across all screenshots (same window size,
same zoom level), open DevTools, switch to a desktop preset like
"Responsive 1280×800", and capture there.

## Updating the manual

After dropping a screenshot here, edit `src/pages/UserManuals.tsx`
and add the `imageSrc` prop to the matching `<ScreenshotPlaceholder>`
call. Commit both the image and the source change together so the
manual stays consistent.

If you find a `<ScreenshotPlaceholder>` whose `description` doesn't
match the current UI (the app has evolved since the description was
written), update the description in the same commit. The text-and-
screenshot pair should always describe the same thing.
