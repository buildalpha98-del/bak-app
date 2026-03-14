"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribe to Supabase Realtime changes on the sessions table.
 * Calls onUpdate() on any INSERT/UPDATE/DELETE event, which should
 * trigger a router.refresh() to reload server-fetched data.
 */
export function useSessionsRealtime(
  weekStart: string, // "YYYY-MM-DD" Monday — used as channel key for cleanup
  onUpdate: () => void
): void {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channelName = `sessions-realtime-${weekStart}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [weekStart, onUpdate]);
}
