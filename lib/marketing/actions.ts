"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PublicStats {
  sessions_all_time: number;
  sessions_this_term: number;
  centre_count: number;
  sport_count: number;
  average_rating: number;
  children_count: number;
  last_calculated: string | null;
}

/**
 * Fetch cached public stats. Runs server-side so no secret is needed.
 */
export async function getPublicStats(): Promise<{
  data: PublicStats | null;
  error: string | null;
}> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/public/stats`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return { data: null, error: `Failed to fetch stats: ${res.status}` };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch stats",
    };
  }
}

/**
 * Trigger a refresh of the public stats cache.
 *
 * This runs server-side so the CRON_SECRET never reaches the browser.
 * Only authenticated admin/ops users should call this (enforced by the
 * calling page's auth check).
 */
export async function refreshPublicStats(): Promise<{
  success: boolean;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify admin/ops role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "ops"].includes(profile.role)) {
    return { success: false, error: "Forbidden" };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { success: false, error: "Server configuration error" };
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/public/refresh-stats`,
      {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return { success: false, error: `Refresh failed: ${res.status}` };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to refresh stats",
    };
  }
}
