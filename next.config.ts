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

const nextConfig: NextConfig = {};

export default withPWA(nextConfig);
