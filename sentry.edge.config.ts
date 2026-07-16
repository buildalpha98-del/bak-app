import * as Sentry from "@sentry/nextjs";

// ============================================================
// Sentry — edge runtime (middleware)
// ============================================================
//
// Same DSN gate as the server config. The middleware runs here, so this
// is what captures the login-loop tripwire (see middleware.ts). Inert
// until SENTRY_DSN is set.

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    ignoreErrors: ["NEXT_REDIRECT", "NEXT_NOT_FOUND"],
  });
}
