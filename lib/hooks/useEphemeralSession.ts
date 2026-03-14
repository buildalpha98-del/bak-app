"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * If the user unchecked "Keep me signed in", signs them out
 * when the browser window/tab is closed.
 */
export function useEphemeralSession() {
  useEffect(() => {
    const isEphemeral = localStorage.getItem("bak-session-ephemeral") === "true";
    if (!isEphemeral) return;

    const supabase = createSupabaseBrowserClient();

    const handleBeforeUnload = () => {
      // Remove the flag so a future login starts fresh
      localStorage.removeItem("bak-session-ephemeral");
      supabase.auth.signOut();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);
}
