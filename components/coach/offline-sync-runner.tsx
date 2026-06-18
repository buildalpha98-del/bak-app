"use client";

/**
 * Mount-once helper for the coach surfaces.
 *
 * - Registers the default sync handlers on first paint
 * - Triggers an immediate sync if we mount while online
 * - Listens for `window.online` so a reconnect kicks off a sync
 * - Polls every 60s while online to catch slow drips of queued work
 * - Listens for `message` events from the service worker (Background Sync
 *   `queue-sync` tag) and runs a sync when the SW asks
 *
 * Renders nothing — it's pure lifecycle plumbing.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { registerDefaultSyncHandlers, syncQueue } from "@/lib/offline/sync";

const POLL_MS = 60_000;

export function OfflineSyncRunner() {
  // Avoid overlapping runs — the engine itself is idempotent but the toast
  // shouldn't double-fire if the interval coincides with an `online` event.
  const inFlightRef = useRef(false);

  useEffect(() => {
    registerDefaultSyncHandlers();

    let cancelled = false;

    async function runSync(reason: "mount" | "online" | "poll" | "sw") {
      if (inFlightRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      inFlightRef.current = true;
      try {
        const result = await syncQueue();
        if (cancelled) return;
        if (result.synced > 0) {
          toast.success(
            `Synced ${result.synced} submission${result.synced === 1 ? "" : "s"}`,
          );
        }
        if (result.failed > 0 && reason !== "poll") {
          // Don't bug the coach on every 60s poll for the same failure —
          // only on explicit reconnect / mount / SW sync events.
          toast.error(
            `${result.failed} item${result.failed === 1 ? "" : "s"} failed — will retry`,
          );
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    // 1. Immediate sync on mount.
    void runSync("mount");

    // 2. Reconnect sync.
    function handleOnline() {
      void runSync("online");
    }
    window.addEventListener("online", handleOnline);

    // 3. Background poll while online.
    const interval = window.setInterval(() => {
      void runSync("poll");
    }, POLL_MS);

    // 4. Service-worker prod — when the SW receives a background-sync `queue-sync`
    //    event it posts { type: 'BAK_SYNC_REQUEST' } to clients. Honour it.
    function handleSwMessage(e: MessageEvent) {
      if (e?.data?.type === "BAK_SYNC_REQUEST") {
        void runSync("sw");
      }
    }
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.clearInterval(interval);
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
    };
  }, []);

  return null;
}
