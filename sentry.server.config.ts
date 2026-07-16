import * as Sentry from "@sentry/nextjs";

// ============================================================
// Sentry — server runtime (Node)
// ============================================================
//
// Everything here is gated on SENTRY_DSN. Until you paste a DSN into the
// Vercel env (Settings → Environment Variables → SENTRY_DSN), init() is
// never called and the SDK is completely inert — no network, no cost, no
// behaviour change. This is the same "code ready, flip later" shape as
// the Square cutover.
//
// Scope is deliberately errors-only (see docs/sentry-setup.md): no
// performance tracing, no session replay. The point of this is a
// tripwire for hard-down, not an APM bill.

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Errors only — no transaction sampling.
    tracesSampleRate: 0,
    // Don't ship the noise that isn't actionable.
    ignoreErrors: [
      // Next's redirect/notFound control-flow throw is not an error.
      "NEXT_REDIRECT",
      "NEXT_NOT_FOUND",
    ],
  });
}
