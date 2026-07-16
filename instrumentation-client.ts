import * as Sentry from "@sentry/nextjs";

// ============================================================
// Sentry — browser
// ============================================================
//
// Gated on the PUBLIC DSN (a separate var: NEXT_PUBLIC_SENTRY_DSN, since
// the client bundle can't read the server-only SENTRY_DSN). Inert until
// set. Errors only — no replay, no client tracing.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    // React #418/#310 hydration errors were the bulk of yesterday's
    // noise and are now fixed; if they recur they should surface, so
    // they are deliberately NOT ignored here.
    ignoreErrors: [
      // Browser extensions and network blips, not our bugs.
      "ResizeObserver loop",
      "Non-Error promise rejection captured",
    ],
  });
}

// Instruments client-side navigations so a route change that throws is
// attributed to the right page. No-op without a DSN.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
