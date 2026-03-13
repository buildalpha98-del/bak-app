"use client";

import { Check, CloudOff, Loader2 } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

export function SyncIndicator() {
  const { isOnline, hasPending, isSyncing } = useOnlineStatus();

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
        <Loader2 className="size-3 animate-spin" />
        Syncing…
      </div>
    );
  }

  if (!isOnline || hasPending) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
        <CloudOff className="size-3" />
        {isOnline ? "Saving…" : "Saved locally — will sync when online"}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
      <Check className="size-3" />
      Synced
    </div>
  );
}
