import { ReloadButton } from "@/components/shared/reload-button";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
          {/* Inline SVG — Lucide may not be cached offline */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <line x1="2" x2="22" y1="2" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
            <line x1="12" x2="12.01" y1="20" y2="20" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">
          You&apos;re Offline
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          It looks like you&apos;ve lost your internet connection. Don&apos;t
          worry — your pending work is saved and will sync automatically when you
          reconnect.
        </p>
        <ReloadButton />
      </div>
    </div>
  );
}
