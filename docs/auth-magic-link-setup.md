# Magic-link setup — Supabase + Resend

Magic-link emails are sent by **Supabase Auth**, not by your app's Resend
client. Connecting Resend inside the codebase only handles transactional
mail (invitations, reports, invoices, onboarding). For magic links and
password resets to land in inboxes, Supabase needs Resend wired in as
its SMTP provider, and Vercel needs the canonical site URL set.

## 1. Vercel env vars (already in code — needs to be set on the project)

In Vercel dashboard → Project Settings → Environment Variables, add these
to **Production** (and Preview if you want preview deploys to work):

```
NEXT_PUBLIC_SITE_URL=https://buildalphakids.app
```

That's the only new one. `lib/utils/base-url.ts` prefers it over
`VERCEL_URL`, which is the per-deployment subdomain and breaks magic
links because Supabase rejects the redirect.

## 2. Supabase Auth — redirect allow-list

Supabase dashboard → Authentication → URL Configuration:

- **Site URL**: `https://buildalphakids.app`
- **Redirect URLs** — add ALL of:
  - `https://buildalphakids.app/auth/callback`
  - `https://buildalphakids.app/auth/callback?next=/*`
  - `http://localhost:3000/auth/callback` (for local dev)
  - `http://localhost:3000/auth/callback?next=/*`

Without these, clicking a magic link returns `?error=redirect_to is not
allowed` and the session is never established.

## 3. Supabase Auth — Resend SMTP

Supabase dashboard → Project Settings → Auth → SMTP Settings → enable
"Custom SMTP" and paste:

| Field          | Value                                |
|----------------|--------------------------------------|
| Sender email   | `noreply@buildalphakids.app`         |
| Sender name    | `Build Alpha Kids`                   |
| Host           | `smtp.resend.com`                    |
| Port           | `465`                                |
| Username       | `resend`                             |
| Password       | _your Resend API key_ (`re_...`)     |

The sender domain (`buildalphakids.app`) MUST be verified in Resend
dashboard → Domains, with the DKIM/SPF DNS records published. Until the
domain is verified, every send from Supabase is silently rejected by
Resend and the user just sees nothing arrive.

Resend's default rate limit on a verified domain is 100/day on the free
plan; bump to a paid tier before going live with real volume.

## 4. Supabase Auth — email templates (optional but recommended)

Supabase dashboard → Authentication → Email Templates → "Magic Link":

Default template works fine, but you can rewrite it to match BAK
branding. The variables you can use:

- `{{ .ConfirmationURL }}` — the full callback URL (this MUST be in the
  email — it's the link the user clicks)
- `{{ .Email }}` — the recipient address
- `{{ .Token }}` and `{{ .TokenHash }}` — usually not needed

The same applies for "Reset Password" and "Invite User" templates.

## 5. How the flow works now (after this commit)

1. User visits `/client-login`, types email, hits "Send magic link"
2. `sendClientMagicLink` calls `supabase.auth.signInWithOtp({
   email, options: { emailRedirectTo: getAuthCallbackUrl("/client-login") } })`
3. Supabase generates a token, looks up its SMTP config (= Resend), and
   sends the email. The link inside the email points at Supabase's
   verify endpoint with a callback baked in.
4. User clicks → Supabase verifies the token → redirects to
   `https://buildalphakids.app/auth/callback?next=/client-login&code=<AUTHCODE>`
5. `app/auth/callback/route.ts` calls `supabase.auth.exchangeCodeForSession(code)`,
   which writes the session cookie, then 302s to `/client-login`
6. `/client-login` sees an authenticated client_user and redirects to
   their default centre

If any step fails, the callback redirects to `next` with `?auth_error=`
in the URL so you can see what went wrong instead of getting silent
no-ops.

## 6. Pre-flight checklist before testing

- [ ] `NEXT_PUBLIC_SITE_URL` set in Vercel
- [ ] `RESEND_API_KEY` set in Vercel (you've done this)
- [ ] `buildalphakids.app` verified in Resend dashboard with DNS published
- [ ] Supabase Site URL = `https://buildalphakids.app`
- [ ] Supabase Redirect URLs include `https://buildalphakids.app/auth/callback`
- [ ] Supabase Custom SMTP enabled, pointing at Resend
- [ ] Sender email in Supabase SMTP config = `noreply@buildalphakids.app`
- [ ] At least one `client_users` row exists for the email you're going
      to test with (created via the admin Portal Access tab on a centre)
