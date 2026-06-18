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
| Sender email   | `hello@buildalphakids.app` ← matches `FROM_EMAIL` in code |
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

## 4. Supabase Auth — email templates (REQUIRED for deliverability)

Supabase's default magic-link email is high-spam-score: one button, no
greeting, no plain-text fallback, no physical address. Replace it.

A drop-in branded template is shipped at
[`docs/supabase-email-templates/magic-link.html`](./supabase-email-templates/magic-link.html).

Supabase dashboard → Authentication → Email Templates → "Magic Link":

1. Toggle from "Visual" to "Source" / HTML view
2. Paste the contents of `magic-link.html` (replaces the whole body)
3. Subject line: `Your Build Alpha Kids sign-in link`
4. Hit **Save**
5. Hit **Send test email** to yourself and confirm it lands in inbox

Repeat for "Invite User" and "Reset Password" templates as needed.

## 5. Deliverability — DMARC record (REQUIRED)

After Resend gives you the SPF + DKIM records and you've verified the
domain, add **one more record yourself** at your DNS host:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc.buildalphakids.app` | `v=DMARC1; p=quarantine; rua=mailto:postmaster@buildalphakids.app; pct=100; adkim=s; aspf=s` |

DMARC is the record that flips Gmail's "this looks like phishing"
warning off for new sender domains. Without it, brand-new domains
land in spam ~80% of the time in the first weeks.

## 6. Deliverability — domain warm-up

A 3-month-old domain that suddenly sends 50 magic links looks like
a compromised account. Plan:

- **Week 1**: send to 5–10 inboxes you control. Open them, click links,
  mark "Not spam" if any land in junk.
- **Week 2**: 50–100 real users.
- **Week 3+**: scale freely.

Test sender reputation with [mail-tester.com](https://www.mail-tester.com/):
1. Visit the site, copy the temporary email address
2. Trigger a magic link to that address (via `/admin/centres` Portal Access)
3. Click "Check your score" — aim for 8/10 or higher
4. Anything below 7/10 → read each red flag and fix it

In Gmail, verify auth headers: open the email → ⋮ → "Show original".
Look for:

```
SPF: PASS
DKIM: PASS
DMARC: PASS
```

If any say `none` or `fail`, that's your problem.

## 7. How the flow works now (after this commit)

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

## 8. Pre-flight checklist before testing

**Vercel + Supabase config**
- [ ] `NEXT_PUBLIC_SITE_URL` set in Vercel
- [ ] `RESEND_API_KEY` set in Vercel
- [ ] Supabase Site URL = `https://buildalphakids.app`
- [ ] Supabase Redirect URLs include `https://buildalphakids.app/auth/callback`
- [ ] Supabase Custom SMTP enabled, pointing at Resend
- [ ] Sender email in Supabase SMTP config = `hello@buildalphakids.app`
- [ ] Branded magic-link template pasted into Supabase Email Templates
- [ ] `hello@buildalphakids.app` is monitored (forwards to your real inbox)

**Resend + DNS**
- [ ] `buildalphakids.app` verified in Resend (DKIM + SPF green)
- [ ] DMARC record added at `_dmarc.buildalphakids.app`
- [ ] All three records (SPF, DKIM, DMARC) propagated — check via
      `dig TXT _dmarc.buildalphakids.app` or [mxtoolbox.com](https://mxtoolbox.com/dmarc.aspx)

**Test data**
- [ ] At least one `client_users` row exists for the email you're going
      to test with (created via admin Portal Access tab on a centre)

**Smoke test**
- [ ] Send test magic link to `mail-tester.com` → score ≥ 8/10
- [ ] Send test magic link to your own Gmail → check "Show original" → SPF/DKIM/DMARC all PASS
- [ ] Click the link → lands at `/client/[centreId]` without errors
