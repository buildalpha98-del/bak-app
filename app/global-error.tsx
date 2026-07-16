"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort boundary for errors thrown while rendering the root
// layout — the one place a normal error.tsx can't catch. Reports to
// Sentry (inert without a DSN) and renders a minimal standalone shell,
// since the app's own layout is what failed.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
          color: "#1A1A1A",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666666" }}>
            The page failed to load. Please refresh, or try again shortly.
          </p>
        </div>
      </body>
    </html>
  );
}
