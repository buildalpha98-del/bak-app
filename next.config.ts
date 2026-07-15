import type { NextConfig } from "next";

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

export default withPWA(nextConfig);
