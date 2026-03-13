"use client";

import { useState, useEffect } from "react";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { Wifi, WifiOff, RefreshCw, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncStatusIndicator() {
  const { isOnline, hasPending, isSyncing, sync } = useOnlineStatus();
  const [showSynced, setShowSynced] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  // Hide the "Synced" indicator after 3 seconds
  useEffect(() => {
    if (isOnline && !hasPending && !isSyncing) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, hasPending, isSyncing]);

  // Offline state — always visible
  if (!isOnline) {
    return (
      <div className="flex items-center justify-end px-4 sm:px-6 pt-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 min-h-[44px]">
          <WifiOff className="h-4 w-4 text-destructive" />
          <span className="text-xs font-medium text-destructive">
            Offline{hasPending ? " — pending changes saved" : ""}
          </span>
        </div>
      </div>
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <div className="flex items-center justify-end px-4 sm:px-6 pt-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 min-h-[44px]">
          <RefreshCw className="h-4 w-4 text-amber-600 animate-spin" />
          <span className="text-xs font-medium text-amber-600">Syncing…</span>
        </div>
      </div>
    );
  }

  // Pending changes — clickable to trigger sync
  if (hasPending) {
    return (
      <div className="flex items-center justify-end px-4 sm:px-6 pt-1">
        <button
          onClick={sync}
          className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 min-h-[44px] hover:bg-amber-500/20 transition-colors"
        >
          <Cloud className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-medium text-amber-600">
            Tap to sync pending changes
          </span>
        </button>
      </div>
    );
  }

  // Online and synced — fades after 3s, shown on hover
  if (!showSynced && !isHovered) return null;

  return (
    <div className="flex items-center justify-end px-4 sm:px-6 pt-1">
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 transition-opacity duration-300",
          !showSynced && isHovered ? "opacity-100" : "",
          !showSynced && !isHovered ? "opacity-0" : ""
        )}
      >
        <Wifi className="h-4 w-4 text-emerald-600" />
        <span className="text-xs font-medium text-emerald-600">Synced</span>
      </div>
    </div>
  );
}
