"use server";

import { revalidatePath } from "next/cache";
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

// ============================================================
// Bulk testimonial actions
// ============================================================
//
// Both actions take a list of `feedback_rating_ids` (the pending
// feedback rows the operator selected) and write a row into
// `approved_testimonials` with the correct status. Partial-failure
// surface: a list of `{ id, error }` so the caller can toast the
// successful count and report broken rows.

export interface BulkTestimonialResult {
  succeeded: number;
  failed: Array<{ id: string; error: string }>;
}

/**
 * Bulk-approve a set of pending feedback ids. Approves with the
 * default `centre_name` / `display_name` derived from the linked
 * centre + feedback contact name, and copies the original comment
 * verbatim. Operators who want to edit the displayed copy should
 * use the per-row flow.
 */
export async function bulkApproveTestimonials(
  feedbackIds: string[]
): Promise<{ data: BulkTestimonialResult | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { data: null, error: "Insufficient permissions" };
  }

  if (feedbackIds.length === 0) {
    return { data: { succeeded: 0, failed: [] }, error: null };
  }

  // Fetch source feedback rows + their centres for the display name
  const { data: feedbackRows, error: fetchErr } = await supabase
    .from("feedback_ratings")
    .select(
      "id, rating, comment, centre_id, centres(name, primary_contact_name)"
    )
    .in("id", feedbackIds);

  if (fetchErr) return { data: null, error: fetchErr.message };

  // Skip rows already in approved_testimonials (idempotent)
  const { data: existing } = await supabase
    .from("approved_testimonials")
    .select("feedback_rating_id")
    .in("feedback_rating_id", feedbackIds);

  const alreadyApproved = new Set(
    (existing ?? [])
      .map((r) => r.feedback_rating_id as string | null)
      .filter((id): id is string => !!id)
  );

  const failed: Array<{ id: string; error: string }> = [];
  let succeeded = 0;

  for (const row of feedbackRows ?? []) {
    if (alreadyApproved.has(row.id)) {
      // Skipped, not a failure — silently ignored.
      continue;
    }
    const centre = row.centres as unknown as
      | { name?: string; primary_contact_name?: string }
      | null;
    const displayName =
      centre?.primary_contact_name ?? centre?.name ?? "Build Alpha Kids family";
    const { error: insertErr } = await supabase
      .from("approved_testimonials")
      .insert({
        feedback_rating_id: row.id,
        centre_name: centre?.name ?? "Build Alpha Kids",
        comment: row.comment ?? "",
        rating: row.rating,
        display_name: displayName,
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      });

    if (insertErr) {
      failed.push({ id: row.id, error: insertErr.message });
    } else {
      succeeded += 1;
    }
  }

  revalidatePath("/admin/marketing");
  revalidatePath("/admin/marketing/testimonials");

  return { data: { succeeded, failed }, error: null };
}

/**
 * Bulk-reject a set of pending feedback ids. Writes a `rejected`
 * row into `approved_testimonials` so the source feedback no
 * longer surfaces in the pending list.
 */
export async function bulkRejectTestimonials(
  feedbackIds: string[]
): Promise<{ data: BulkTestimonialResult | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { data: null, error: "Insufficient permissions" };
  }

  if (feedbackIds.length === 0) {
    return { data: { succeeded: 0, failed: [] }, error: null };
  }

  // Skip rows already in approved_testimonials (idempotent)
  const { data: existing } = await supabase
    .from("approved_testimonials")
    .select("feedback_rating_id")
    .in("feedback_rating_id", feedbackIds);

  const alreadyHandled = new Set(
    (existing ?? [])
      .map((r) => r.feedback_rating_id as string | null)
      .filter((id): id is string => !!id)
  );

  const failed: Array<{ id: string; error: string }> = [];
  let succeeded = 0;

  for (const id of feedbackIds) {
    if (alreadyHandled.has(id)) continue;
    const { error: insertErr } = await supabase
      .from("approved_testimonials")
      .insert({
        feedback_rating_id: id,
        centre_name: "",
        comment: "",
        rating: 0,
        display_name: "",
        status: "rejected",
        approved_by: user.id,
      });

    if (insertErr) {
      failed.push({ id, error: insertErr.message });
    } else {
      succeeded += 1;
    }
  }

  revalidatePath("/admin/marketing");
  revalidatePath("/admin/marketing/testimonials");

  return { data: { succeeded, failed }, error: null };
}
