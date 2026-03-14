"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types/database";

/**
 * Subscribe to Realtime INSERT events on the notifications table
 * for the given user. Calls onNewNotification with each new row.
 */
export function useNotificationsRealtime(
  userId: string,
  onNewNotification: (notification: Notification) => void
): void {
  useEffect(() => {
    if (!userId) return;

    const supabase = createSupabaseBrowserClient();
    const channelName = `notifications-${userId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNewNotification(payload.new as Notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onNewNotification]);
}
