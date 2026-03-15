// Error tracking utility - swap to Sentry when ready
// For now, structured console logging with context

interface ErrorContext {
  userId?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export function captureError(error: unknown, context?: ErrorContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error("[ERROR]", {
    message: errorMessage,
    stack: errorStack,
    ...context,
    timestamp: new Date().toISOString(),
  });

  // TODO: Replace with Sentry.captureException(error, { extra: context })
  // when @sentry/nextjs is installed
}

export function captureMessage(message: string, context?: ErrorContext): void {
  console.warn("[WARN]", {
    message,
    ...context,
    timestamp: new Date().toISOString(),
  });
}
