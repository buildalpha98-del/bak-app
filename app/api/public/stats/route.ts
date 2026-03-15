import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production"
      ? "https://buildalphakids.com.au"
      : "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = createSupabaseAdmin();

    const { data: stats, error } = await supabase
      .from("public_stats_cache")
      .select("stat_key, stat_value, calculated_at");

    if (error) {
      console.error("Public stats fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch stats." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Build a flat response object from cached stat rows
    const result: Record<string, unknown> = {};
    let lastCalculated: string | null = null;

    for (const row of stats ?? []) {
      result[row.stat_key] =
        row.stat_value && typeof row.stat_value === "object" && "value" in row.stat_value
          ? row.stat_value.value
          : row.stat_value;

      if (!lastCalculated || row.calculated_at > lastCalculated) {
        lastCalculated = row.calculated_at;
      }
    }

    return NextResponse.json(
      {
        sessions_all_time: result.total_sessions_all_time ?? 0,
        sessions_this_term: result.sessions_this_term ?? 0,
        centre_count: result.centre_count ?? 0,
        sport_count: result.sport_count ?? 0,
        average_rating: result.average_rating ?? 0,
        children_count: result.total_children ?? 0,
        last_calculated: lastCalculated,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err) {
    console.error("Public stats API error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
