"use client";

import { useCallback, useEffect, useState } from "react";
import { getQueue } from "./db";

export interface ConnectionState {
  online: boolean;
  queueLength: number;
  /** Epoch ms of the last successful sync, or `null` if no sync has happened
   * yet in this device's lifetime. Persisted via localStorage. */
  lastSyncAt: number | null;
}

const LAST_SYNC_KEY = "bak-offline-last-sync";
const POLL_INTERVAL_MS = 5_000;

function readLastSync(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to network state + queue length + last-sync timestamp.
 *
 * Designed to be shared across the OfflineIndicator and any surface that
 * wants to react to connectivity changes. The 5-second poll catches:
 *  - Items queued by a sibling component since the last render
 *  - The `lastSyncAt` update written by `syncQueue` into localStorage
 *  - Drift between `navigator.onLine` and reality on mobile WebViews
 *
 * The hook is safe to mount on the server (SSR): it returns an "online,
 * empty queue, no last-sync" state until the effect runs in the browser.
 */
export function useOnlineState(): ConnectionState {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    if (typeof navigator.onLine !== "boolean") return true;
    return navigator.onLine;
  });
  const [queueLength, setQueueLength] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await getQueue();
      setQueueLength(items.length);
    } catch {
      // Defensive — getQueue already swallows errors and returns [], but
      // belt and braces.
      setQueueLength(0);
    }
    setLastSyncAt(readLastSync());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    function handleStorage(e: StorageEvent) {
      if (e.key === LAST_SYNC_KEY) {
        setLastSyncAt(readLastSync());
      }
    }

    setOnline(navigator.onLine);
    refresh();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorage);

    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { online, queueLength, lastSyncAt };
}
