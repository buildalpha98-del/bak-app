import * as Sentry from "@sentry/nextjs";

// ============================================================
// Error tracking
// ============================================================
//
// Delegates to Sentry, which is inert until a DSN is set (see the
// sentry.*.config.ts files). Structured console output stays as the
// local/no-DSN fallback so nothing is lost in dev or before the DSN is
// pasted into Vercel.

interface ErrorContext {
  userId?: string;
  action?: string;
  metadata?: Record<string, unknown>;
  // Escalate to Sentry's fatal level — reserve for hard-down conditions
  // (auth infrastructure unreachable, the login-loop tripwire). These
  // are what the "only hard-down" Sentry alert rule pages on.
  fatal?: boolean;
}

export function captureError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));

  Sentry.captureException(err, {
    level: context?.fatal ? "fatal" : "error",
    user: context?.userId ? { id: context.userId } : undefined,
    tags: context?.action ? { action: context.action } : undefined,
    extra: context?.metadata,
  });

  // Local visibility. Excludes the stack in production — stacks leak
  // paths and PII into logs; Sentry keeps the full trace.
  if (process.env.NODE_ENV !== "production") {
    console.error("[ERROR]", {
      message: err.message,
      stack: err.stack,
      ...context,
      timestamp: new Date().toISOString(),
    });
  } else {
    console.error("[ERROR]", { message: err.message, action: context?.action });
  }
}

export function captureMessage(message: string, context?: ErrorContext): void {
  Sentry.captureMessage(message, {
    level: context?.fatal ? "fatal" : "warning",
    user: context?.userId ? { id: context.userId } : undefined,
    tags: context?.action ? { action: context.action } : undefined,
    extra: context?.metadata,
  });

  if (process.env.NODE_ENV !== "production") {
    console.warn("[WARN]", {
      message,
      ...context,
      timestamp: new Date().toISOString(),
    });
  }
}
