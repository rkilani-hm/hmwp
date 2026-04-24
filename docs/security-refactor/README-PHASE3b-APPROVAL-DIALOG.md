# Phase 3b — Approval dialog redesign

**Scope:** tightly focused on the most-used interaction in the app.
Approvers sign off on permits and gate passes multiple times a day, so
the signing flow has outsized impact on perceived quality. This phase
rebuilds that single flow.

## Changes

### SecureApprovalDialog
Full rewrite. Same public API (props and `onConfirm` signature
unchanged), so all four callers — `ApproverInbox`, `PermitDetail`,
`GatePassDetail`, plus anywhere else it's mounted — continue to work
without modification.

Specific improvements:
- Header uses `ShieldCheck` in the brand red primary token instead of
  the old shield-plus-lock stack, giving one strong visual anchor.
- Tabs: fingerprint tab leads when biometric is supported on mobile
  (previously password was always first). Fingerprint is faster to
  complete; leading with it matches intent.
- Biometric panel: removed the large decorative fingerprint-in-circle
  illustration. One prominent `Verify with Fingerprint` button,
  full-width, 56px tall — the exact same affordance the user expects
  from a mobile OS biometric prompt. Verified state is a compact
  success chip with the success token (green), not a pastel card.
- "Security Notice" block is collapsed by default behind a small info
  toggle that expands to a two-line summary. Previously it occupied
  ~25% of the dialog's vertical space with a bulleted list. Reclaimed
  space goes to the signature pad.
- Footer buttons stack on mobile (`flex-col sm:flex-row`), giving full
  tap targets instead of two cramped buttons side by side on narrow
  phones.
- Destructive actions use `variant="destructive"` (brand red token)
  instead of inline Tailwind color classes.
- Every string routes through `useTranslation()`. Arabic works here.
- `dir="auto"` on title, description, error, and audit notice so user-
  entered text always renders in its natural direction regardless of
  the current UI language.

### SignaturePad
Full rewrite. Same public API (`onSave`), but `onSave` is now called
automatically on `onEnd` (stroke lift) rather than requiring a separate
"Confirm signature" tap. Caller receives the dataURL immediately. Clear
pushes `null` back.

Default height bumped from 128px to 220px. Approvers on phones were
squeezed into a strip narrower than a postage stamp; signatures looked
cramped and hard to compare against the originals on the PDF. 220px is
roughly double and still fits comfortably with the rest of the dialog.

Pen color is now `hsl(60 3% 11%)` (brand charcoal) instead of the
previous hardcoded HSL. Touch-action: none prevents the canvas from
scrolling the page under the finger during signing.

Canvas devicePixelRatio handling — the canvas now resizes correctly on
rotate and high-DPI screens. Previous version sometimes drew off-center
on retina displays because the internal canvas pixel grid didn't match
the CSS size.

### ApproverInbox action buttons
Small-but-important cleanup while I was there:

- The "Approve" button was using `bg-green-600 hover:bg-green-700
  text-white` — hardcoded Tailwind colors that bypassed the brand
  token system established in Phase 3a. Now uses `bg-success
  text-success-foreground`, so if you ever re-tune the success hue in
  `index.css`, the inbox follows.
- Rejected previously used an outline-destructive mix — now the proper
  `variant="destructive"` for consistency with the dialog.
- All button labels migrated from hardcoded English to `t()` calls.
  Arabic mode now translates the inbox action row.

## What's NOT in this phase

- PermitFormWizard split (635-line monolith → focused components)
- Dashboard widget density
- Mobile card views for other list pages
- Loading skeletons
- Empty states
- PDF preview mobile sizing

Those are the rest of the "Phase 3b originally proposed" list. I cut
them from this phase to keep the PR reviewable and the risk low — if
something regresses visually, the blast radius is the approval dialog
alone. These items land as Phase 3c.

## Dependencies

No new npm packages. No migrations. No edge functions. No secrets.
Pure client-side change.

## Deployment

1. Pull branch.
2. Build and deploy frontend bundle.

## Testing

From a phone, ideally the same one that approvers use in the field:

1. Open any pending permit from the Approver Inbox.
2. Tap Approve. Dialog should open with either:
   - Fingerprint tab leading (if you have a registered biometric), or
   - Password field directly (if not mobile, or no biometric registered)
3. Signature pad should fill the width of the dialog and be ~220px
   tall. Signing should feel unrestricted.
4. Clear button appears to the right of the pad (left in Arabic/RTL).
5. "What gets logged" toggle — should expand to a single paragraph.
6. Approve submits. Previous flow of having to tap "Confirm signature"
   after signing is gone — signature auto-commits on pen lift.
7. Switch to Arabic. Open the dialog again. All labels translate,
   layout flips RTL, signature pad still works the same way.

## Known leftover issues

Not regressions from this phase, but worth tracking:

- `src/components/ui/PasswordStrengthIndicator.tsx` still uses
  `bg-green-500` hardcoded color (color-codes strength levels).
- Several PublicPermitStatus / PublicScanVerify pages still have
  hardcoded green/red colors. Phase 3c sweep.
- In ApproverInbox, `AlertTriangle` "URGENT" and "SLA BREACHED" badge
  labels are still hardcoded English. They have i18n keys now
  (`approverInbox.urgentBadge`, `approverInbox.slaBreachedBadge`) but
  the JSX hasn't been switched yet — saved for the same Phase 3c sweep
  to keep this PR tight.
