"use server";

// ============================================================
// Marketing dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N pending testimonials · M approved this week ·
// K cache age · F enquiries" strip above /admin/marketing.
//
// Implementation notes:
//   - Pending testimonials are high-rated (≥4) feedback rows with a
//     comment that haven't been moved into `approved_testimonials`.
//     A `getApprovedFeedbackIds` exclusion list lets us cheaply
//     count via SQL rather than loading the full feedback set.
//   - Cache freshness uses `public_stats_cache.last_calculated` —
//     a value > 24h old surfaces as a count of "1 stale cache" so
//     ops sees the issue without us having to model time as a count
//     elsewhere.
//   - Web enquiries: the platform doesn't yet model an inbound
//     enquiry table, so we proxy to leads created in the last 7d
//     with source = "web". Empty when missing.
//   - Errors swallow to zeros so a single broken query doesn't blank
//     the whole page; mirrors the staff + centres pulse patterns.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface MarketingStatusPulse {
  pendingTestimonialsCount: number;
  approvedThisWeekCount: number;
  staleCacheCount: number;
  webEnquiriesCount: number;
}

export async function getMarketingStatusPulse(): Promise<MarketingStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();
    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // ============================================================
    // Approved feedback ids (small set, cheap to fetch).
    // ============================================================

    const { data: approvedRows } = await supabase
      .from("approved_testimonials")
      .select("feedback_rating_id");

    const approvedIds = (approvedRows ?? [])
      .map((r) => r.feedback_rating_id as string | null)
      .filter((id): id is string => !!id);

    // ============================================================
    // Pending testimonials: rating >= 4, has comment, submitted,
    // NOT in approved_testimonials.
    // ============================================================

    let pendingQuery = supabase
      .from("feedback_ratings")
      .select("id", { count: "exact", head: true })
      .gte("rating", 4)
      .not("comment", "is", null)
      .not("submitted_at", "is", null);

    if (approvedIds.length > 0) {
      pendingQuery = pendingQuery.not(
        "id",
        "in",
        `(${approvedIds.join(",")})`
      );
    }

    const [
      pendingRes,
      approvedThisWeekRes,
      cacheRes,
      webEnquiriesRes,
    ] = await Promise.all([
      pendingQuery,
      supabase
        .from("approved_testimonials")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .gte("approved_at", mondayIso),
      supabase
        .from("public_stats_cache")
        .select("calculated_at")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("source", "web")
        .gte("created_at", sevenDaysAgoIso),
    ]);

    // Cache freshness — count 1 if older than 24h, else 0.
    let staleCacheCount = 0;
    const lastCalc = cacheRes.data?.calculated_at as string | null;
    if (!lastCalc) {
      staleCacheCount = 1;
    } else {
      const ageHrs =
        (Date.now() - new Date(lastCalc).getTime()) / (60 * 60 * 1000);
      if (ageHrs > 24) staleCacheCount = 1;
    }

    return {
      pendingTestimonialsCount: pendingRes.count ?? 0,
      approvedThisWeekCount: approvedThisWeekRes.count ?? 0,
      staleCacheCount,
      webEnquiriesCount: webEnquiriesRes.count ?? 0,
    };
  } catch (err) {
    console.error("getMarketingStatusPulse error:", err);
    return {
      pendingTestimonialsCount: 0,
      approvedThisWeekCount: 0,
      staleCacheCount: 0,
      webEnquiriesCount: 0,
    };
  }
}
