"use client";

import { useState, useEffect, useCallback } from "react";
import { syncPendingActions, getPendingActions } from "./sessionQueue";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [hasPending, setHasPending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkPending = useCallback(async () => {
    try {
      const pending = await getPendingActions();
      setHasPending(pending.length > 0);
    } catch {
      // IndexedDB may not be available in SSR
    }
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncPendingActions();
      await checkPending();
    } catch {
      // Sync failed — will retry on next reconnect
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, checkPending]);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);
    checkPending();

    function handleOnline() {
      setIsOnline(true);
      // Auto-sync on reconnect
      sync();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkPending, sync]);

  return { isOnline, hasPending, isSyncing, sync, checkPending };
}
