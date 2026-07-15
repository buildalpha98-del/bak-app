import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { pickCurrentTerm, type TermRow } from "@/lib/marketing/public-stats";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production"
      ? "https://buildalphakids.com.au"
      : "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token || token !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorised." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Sessions are counted as "everything not cancelled" — the repo-wide
    // convention (client portal, launch dashboard). Ops runs a
    // headcount-only workflow and never flips sessions to 'completed',
    // so the previous .eq("status", "completed") filters matched zero
    // rows and wrote 0s to the marketing homepage.

    // 1. Total sessions all time (non-cancelled)
    const { count: totalSessionsAllTime } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .neq("status", "cancelled");

    // 2. Sessions this term (non-cancelled, in the current term)
    const { data: termRows } = await supabase
      .from("terms")
      .select("id, start_date, end_date, status");

    const currentTerm = pickCurrentTerm(
      (termRows ?? []) as TermRow[],
      sydneyTodayIso()
    );

    let sessionsThisTerm = 0;
    if (currentTerm) {
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .neq("status", "cancelled")
        .eq("term_id", currentTerm.id);
      sessionsThisTerm = count ?? 0;
    }

    // 3. Active centre count
    const { count: centreCount } = await supabase
      .from("centres")
      .select("id", { count: "exact", head: true })
      .eq("contract_status", "active");

    // 4. Distinct sports from sessions
    const { data: sportRows } = await supabase
      .from("sessions")
      .select("sport")
      .not("sport", "is", null);

    const uniqueSports = new Set((sportRows ?? []).map((r) => r.sport));
    const sportCount = uniqueSports.size;

    // 5. Average rating
    const { data: ratingData } = await supabase
      .from("feedback_ratings")
      .select("rating")
      .not("submitted_at", "is", null)
      .not("rating", "is", null);

    let averageRating = 0;
    if (ratingData && ratingData.length > 0) {
      const sum = ratingData.reduce((acc, r) => acc + (r.rating ?? 0), 0);
      averageRating = Math.round((sum / ratingData.length) * 10) / 10;
    }

    // 6. Total active children — the per-child roster is the only
    // honest source for this stat. It renders publicly as "Kids
    // coached", so it must never be estimated from centre capacity or
    // any other proxy. The roster is empty while ops runs a
    // headcount-only workflow; 0 is the correct value until it's
    // populated, and the marketing band renders 0 as an em-dash.
    const { count: totalChildren } = await supabase
      .from("children")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    // Upsert all stats
    const statsToUpsert = [
      { stat_key: "total_sessions_all_time", stat_value: { value: totalSessionsAllTime ?? 0 } },
      { stat_key: "sessions_this_term", stat_value: { value: sessionsThisTerm } },
      { stat_key: "centre_count", stat_value: { value: centreCount ?? 0 } },
      { stat_key: "sport_count", stat_value: { value: sportCount } },
      { stat_key: "average_rating", stat_value: { value: averageRating } },
      { stat_key: "total_children", stat_value: { value: totalChildren ?? 0 } },
    ];

    for (const stat of statsToUpsert) {
      const { error } = await supabase
        .from("public_stats_cache")
        .upsert(
          {
            stat_key: stat.stat_key,
            stat_value: stat.stat_value,
            calculated_at: now,
            expires_at: expiresAt,
          },
          { onConflict: "stat_key" }
        );

      if (error) {
        console.error(`Failed to upsert stat ${stat.stat_key}:`, error);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Stats refreshed successfully.",
        stats: Object.fromEntries(
          statsToUpsert.map((s) => [s.stat_key, s.stat_value.value])
        ),
        calculated_at: now,
        expires_at: expiresAt,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Refresh stats API error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
