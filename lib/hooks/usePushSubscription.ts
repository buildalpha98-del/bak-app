"use client";

import { useEffect, useRef } from "react";
import { subscribeToPush } from "@/lib/notifications/push-subscription";

/**
 * Auto-register for push notifications on mount.
 * Requests permission if "default", subscribes if granted.
 * Should be used once in the dashboard layout.
 */
export function usePushSubscription(): void {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    async function register() {
      if (!("Notification" in window)) return;

      const permission = Notification.permission;

      if (permission === "denied") return;

      if (permission === "default") {
        const result = await Notification.requestPermission();
        if (result !== "granted") return;
      }

      await subscribeToPush();
    }

    register();
  }, []);
}
