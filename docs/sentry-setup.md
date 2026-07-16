# Sentry — error tracking & hard-down alerting

Everything is wired and inert. Sentry does nothing until you create a
project and paste its keys into Vercel — the same "code ready, flip
later" shape as the Square cutover. No account has been created for you.

## What's already built

- `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` — runtime init, all gated on a DSN env var.
- `instrumentation.ts` — loads the right config per runtime; `onRequestError` forwards nested RSC render errors.
- `app/global-error.tsx` — root-layout error boundary reports to Sentry.
- `lib/utils/errorTracking.ts` — `captureError` / `captureMessage` delegate to Sentry (pass `{ fatal: true }` for hard-down).
- `middleware.ts` — `safeRedirect()` trips a **fatal** event if a redirect ever loops (the exact shape of the login outage on 2026-07-15).
- `GET /api/health` — returns 503 if the database is unreachable; the target for uptime monitoring.

Errors only: no performance tracing, no session replay — a tripwire, not an APM bill.

## To turn it on

1. Create a Sentry project (platform: **Next.js**). This is yours to do — it needs your account.
2. In **Vercel → Settings → Environment Variables** (Production), add:
   - `SENTRY_DSN` — the project DSN (server + edge).
   - `NEXT_PUBLIC_SENTRY_DSN` — the same DSN (browser bundle; must be public).
   - `SENTRY_ORG`, `SENTRY_PROJECT` — for source-map upload at build.
   - `SENTRY_AUTH_TOKEN` — a token with `project:releases` scope (source-map upload only; optional to start).
3. Redeploy. That's the flip — nothing in code changes.

## Alert rules (in the Sentry dashboard) — "hard-down only"

Per the chosen scope, keep alerting narrow. Two rules:

1. **Fatal events** → Alerts → new rule → *when an event's level equals `fatal`* → email you. This fires on the redirect-loop tripwire and any `captureError(e, { fatal: true })`.
2. **App unreachable** → **Uptime Monitoring** → monitor `https://buildalphakids.app/api/health` every 1–5 min → alert on a non-200 or timeout. This is the database-down / app-unreachable signal that no exception would surface.

Optionally add a **Cron Monitor** per Vercel cron later, so a job that silently stops running pages you — not built here, since the scope was hard-down.

## Why this shape

The two production outages on 2026-07-15 (login redirect loop, dead email) both returned normal HTTP status codes and threw nothing — a plain "alert on exceptions" setup would have stayed silent through both. The health probe covers "can't reach the DB", and the redirect-loop tripwire covers "login is looping", which are the two hard-down cases that are otherwise invisible.
