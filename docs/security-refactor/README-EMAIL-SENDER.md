# Email sender setup

The notification system sends mail through Microsoft Graph API
using app-only (application) permissions. Two edge functions send
mail directly:

- `supabase/functions/send-email-notification/index.ts` — workflow
  notifications (new permit, approval required, approved, rejected,
  rework, forwarded, closed, SLA warning, SLA breach, status update)
- `supabase/functions/email-gate-pass-pdf/index.ts` — emails the
  generated gate pass PDF as an attachment

A third function (`resend-approval-notification`) chains through
`send-email-notification` and inherits the same sender.

## Sender resolution

```ts
const fromEmail =
  senderEmail                                  // explicit caller arg (rare)
  || Deno.env.get("MS_SENDER_EMAIL")           // env var (recommended config point)
  || "permits@alhamra.com.kw";                 // hardcoded fallback (Al Hamra shared mailbox)
```

In production the recommended setup is:

- **Shared mailbox** in M365: `permits@alhamra.com.kw` (display name:
  "Al Hamra Permits"). Free in M365, no license required.
- **Supabase env var** `MS_SENDER_EMAIL` set to `permits@alhamra.com.kw`
  for explicit configuration. The hardcoded fallback is the same
  value, so the system stays correct even if the env var is
  unset/missing.

## M365 / Azure setup checklist

For someone setting this up fresh:

1. **Create shared mailbox** in admin.microsoft.com → Teams &
   Groups → Shared mailboxes:
   - Name: `Al Hamra Permits`
   - Address: `permits@alhamra.com.kw`
2. **App registration** in portal.azure.com → Microsoft Entra ID →
   App registrations:
   - Existing app or new — needs `Mail.Send` (Application
     permission, not Delegated) on Microsoft Graph
   - Admin consent must be granted
   - Client secret is stored in Supabase as `MS_CLIENT_SECRET`
   - Tenant ID stored as `MS_TENANT_ID`
   - Client ID stored as `MS_CLIENT_ID`
3. **(Recommended) Restrict the app** to only this mailbox using
   an Application Access Policy in Exchange Online:

   ```powershell
   Connect-ExchangeOnline
   New-ApplicationAccessPolicy `
     -AppId <CLIENT_ID> `
     -PolicyScopeGroupId permits@alhamra.com.kw `
     -AccessRight RestrictAccess `
     -Description "Restrict permits app to permits mailbox only"
   ```

   This way, even if the client secret leaks, an attacker can only
   send mail from the permits mailbox — not from any other tenant
   mailbox.

## Why a shared mailbox

A shared mailbox was chosen over an individual user mailbox because:

- **No license required.** Shared mailboxes are free in M365 up to
  50 GB. Individual mailboxes require a paid license.
- **Survives staff changes.** No risk of the sender breaking when an
  individual leaves the company.
- **Generic sender label.** Recipients see "Al Hamra Permits" rather
  than a person's name — appropriate for system notifications.
- **Auditable.** Sent items are visible to anyone with delegate
  access on the mailbox; no individual's personal sent folder is
  involved.

## Switching the sender later

If you ever want to change the sender:

1. **Easy path:** set the `MS_SENDER_EMAIL` env var in Supabase to
   the new address. No code change needed. The Azure AD app must
   have `Mail.Send` on the new mailbox.
2. **Hardcoded fallback:** if you also want to update the fallback
   in source, edit the two files listed at the top of this README.
   Look for `permits@alhamra.com.kw` and change in both places.

## What recipients see

The "From" header on outgoing email is determined by Microsoft Graph
based on the mailbox the API call sends from
(`/users/{fromEmail}/sendMail`). The display name is the shared
mailbox's name ("Al Hamra Permits"). Recipients see:

```
From: Al Hamra Permits <permits@alhamra.com.kw>
```

If you want to change the display name, rename the shared mailbox
in M365. The change propagates to outgoing mail automatically — no
code change required.
