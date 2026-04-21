"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function TrainingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured logging will replace this in production
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dev] Training page error:", error.message);
    }
  }, [error]);

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div className="text-center max-w-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mx-auto mb-4">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">
          Could not load training data
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Something went wrong loading the training page. Please try again or
          contact support if the problem persists.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
