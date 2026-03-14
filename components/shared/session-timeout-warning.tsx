"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minutes

export function SessionTimeoutWarning() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabaseRef = useRef(createSupabaseBrowserClient());

  const refreshSession = useCallback(async () => {
    await supabaseRef.current.auth.refreshSession();
  }, []);

  const scheduleWarning = useCallback(
    (expiresAt: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      const nowMs = Date.now();
      const expiresMs = expiresAt * 1000;
      const warningAt = expiresMs - WARNING_BEFORE_MS;
      const delay = warningAt - nowMs;

      if (delay <= 0) {
        // Already within the warning window — show immediately
        toast.warning("Your session expires in 5 minutes", {
          description: "Click to stay signed in.",
          duration: Infinity,
          action: {
            label: "Stay signed in",
            onClick: refreshSession,
          },
        });
        return;
      }

      timerRef.current = setTimeout(() => {
        toast.warning("Your session expires in 5 minutes", {
          description: "Click to stay signed in.",
          duration: Infinity,
          action: {
            label: "Stay signed in",
            onClick: refreshSession,
          },
        });
      }, delay);
    },
    [refreshSession]
  );

  useEffect(() => {
    const supabase = supabaseRef.current;

    // Schedule from current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.expires_at) {
        scheduleWarning(session.expires_at);
      }
    });

    // Reschedule on token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.expires_at) {
        scheduleWarning(session.expires_at);
      }
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      subscription.unsubscribe();
    };
  }, [scheduleWarning]);

  return null;
}
