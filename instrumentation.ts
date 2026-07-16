// Next.js instrumentation hook — runs once per runtime at boot. Loads
// the matching Sentry config for whichever runtime this is. Both configs
// are inert without SENTRY_DSN, so this is a no-op until the DSN is set.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forwards a nested React Server Component render error to Sentry. Safe
// to export unconditionally — it delegates to the SDK, which does nothing
// without a DSN.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
