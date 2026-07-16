import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
// Relative, not "@/lib/..." — next.config.ts is loaded before the
// tsconfig path aliases are available to resolve.
import { WP_REDIRECTS } from "./lib/marketing/wp-redirects";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  customWorkerDir: "worker",
  // Document fallback: when the user navigates while offline and the
  // requested page isn't already cached, serve `/offline` instead of
  // the browser's default "no internet" chrome. Authenticated routes
  // are still attempted first via NetworkFirst — this is the last
  // resort.
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "supabase-api",
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 },
        // Fall back to cache after 10s instead of hanging on a dead
        // connection — NetworkFirst waits forever by default.
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /\/_next\/image\?.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image",
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  // Old WordPress URLs → their new home. Next evaluates redirects()
  // BEFORE middleware, so these fire for signed-out crawlers without
  // ever hitting the auth gate.
  async redirects() {
    return WP_REDIRECTS;
  },
  experimental: {
    // Client router cache for dynamic pages. Next 15+ defaults this to
    // 0, so every sidebar click re-rendered the full page server-side
    // even when the operator had just been there. 30s keeps rapid
    // back-and-forth navigation instant; data-changing actions still
    // bust it via router.refresh()/revalidatePath.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

// withSentryConfig wraps the build for source-map upload and the
// client-error tunnel. Its build-time steps only run when the Sentry
// env vars (SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN) are set, so
// with no DSN configured this is a pass-through and the build is
// unchanged. See docs/sentry-setup.md.
export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Quieter builds; only upload source maps when a token is present.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Route the browser SDK's requests through our own domain so
  // ad-blockers don't eat client-side error reports.
  tunnelRoute: "/monitoring",
  // Tree-shake the SDK's debug logging out of the production bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
});
