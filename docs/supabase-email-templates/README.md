# Supabase email templates

Drop-in branded templates that replace Supabase's default magic-link
and password-reset emails. The defaults are spam-bait (one button,
no greeting, no plain-text alternative, no sender info) — these are
designed to clear Gmail/Outlook spam filters and read like real human
correspondence.

## How to install

1. Open [Supabase Dashboard → Authentication → Email Templates](https://supabase.com/dashboard/project/yhairjbwqvmrbbvatrze/auth/templates)
2. Click the template you want to replace (Magic Link, Invite User, Reset Password, etc.)
3. Switch from "Visual" to "Source" (HTML view) — usually a toggle at the top
4. Paste the full contents of the matching `.html` file in this folder
5. Hit **Save**
6. Hit **Send Test Email** to yourself to verify

## Template variables

Supabase uses Go template syntax. Available variables per template:

| Variable | Meaning |
|---|---|
| `{{ .ConfirmationURL }}` | The magic link URL — REQUIRED in the body |
| `{{ .Email }}` | Recipient email address |
| `{{ .SiteURL }}` | Your site URL from auth config |
| `{{ .Token }}` | Raw 6-digit OTP (not used in our templates) |
| `{{ .TokenHash }}` | Hashed token (not used) |

## What's in this folder

- `magic-link.html` — Sign-in link sent when someone requests login at `/client-login`, `/parent-login`, or `/login`. Currently the only template implemented.

## Things to swap in before going live

In every template, find and replace these placeholders with your real
values:

- **Physical address**: Currently `Build Alpha Kids · South-West Sydney, NSW Australia` — replace with your registered business address. CAN-SPAM and Australian Spam Act both require a physical address in commercial emails (transactional is exempt but it doesn't hurt).
- **Reply-to behaviour**: Templates say "Reply to this email and we'll respond personally." Make sure `hello@buildalphakids.app` is a monitored inbox (forwarding to your real address is fine). If you can't monitor it, change the footer copy.
- **Brand colour**: All templates use `#E8712A` (BAK orange). Search-replace if you ever rebrand.

## Why these beat the defaults

| Issue with Supabase defaults | How we fix it |
|---|---|
| Single link, no body text | Greeting + reason + button + raw URL fallback |
| No physical address | Footer includes address (CAN-SPAM compliance) |
| Generic "Confirm your email" subject | Set in Supabase to "Your Build Alpha Kids sign-in link" |
| No "didn't request this" footer | Adds reassurance copy that lowers phishing flags |
| Heavy use of buttons-only content | Button + plain-URL fallback so clients that strip buttons still work |
| No reply path | Sender is `hello@`, reply works, lifts engagement signals |
