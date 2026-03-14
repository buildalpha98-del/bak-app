"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribe to Supabase Realtime changes on the swap_requests table.
 * Calls onUpdate() on any INSERT/UPDATE/DELETE event, which should
 * trigger a router.refresh() to reload server-fetched data.
 */
export function useSwapRequestsRealtime(onUpdate: () => void): void {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channelName = "swap-requests-realtime";

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swap_requests" },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);
}
