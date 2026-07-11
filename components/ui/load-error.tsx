"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  message?: string | null;
}

/**
 * Standard data-load failure box with a retry affordance. Use it when a
 * page or section fetch fails — router.refresh() re-runs the server
 * components, which is the actual fix for a transient fetch error.
 * Inline form/mutation errors keep their own local error displays.
 */
export function LoadError({ message }: Props) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {message || "Failed to load page data."}
      </span>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="inline-flex h-9 min-w-[44px] items-center gap-1.5 rounded-lg border border-red-200 bg-card px-3 text-xs font-medium text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/60"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}
