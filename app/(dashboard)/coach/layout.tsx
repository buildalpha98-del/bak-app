import { OfflineSyncRunner } from "@/components/coach/offline-sync-runner";
import { OfflineIndicator } from "@/components/coach/offline-indicator";

/**
 * Coach-only layout shim.
 *
 * Mounts:
 *  - {@link OfflineSyncRunner} — registers default sync handlers, kicks an
 *    immediate sync on mount, hooks `window.online`, polls every 60s, and
 *    listens for service-worker background-sync messages.
 *  - {@link OfflineIndicator} — top-right pill showing offline status / queue
 *    length, with a popover for retry/discard affordances.
 *
 * The outer dashboard layout already provides `SyncStatusIndicator` (the
 * older single-queue widget) — both can co-exist; the new pill is a coach-
 * specific richer surface targeted at the field-execution UX gap.
 */
export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OfflineSyncRunner />
      <div className="pointer-events-none fixed right-3 top-16 z-50 sm:right-6 sm:top-20">
        <div className="pointer-events-auto">
          <OfflineIndicator />
        </div>
      </div>
      {children}
    </>
  );
}
