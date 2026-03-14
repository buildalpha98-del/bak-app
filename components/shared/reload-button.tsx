"use client";

export function ReloadButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
    >
      Try Again
    </button>
  );
}
