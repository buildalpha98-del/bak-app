import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// GET /api/health — hard-down probe
// ============================================================
//
// Returns 200 only when the app can reach its database. Returns 503
// otherwise. Point Sentry Uptime Monitoring (or any uptime checker) at
// this URL: a non-200 or a timeout is the "app unreachable / database
// down" alert. This is the half of hard-down that no thrown exception
// would surface — if the DB is unreachable, pages just hang, they don't
// error in a way Sentry sees.
//
// Deliberately unauthenticated and cheap: one trivially-indexed count,
// no user data. Never cached — a stale 200 would defeat the point.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase = createSupabaseAdmin();
    // Cheapest possible reachability check: HEAD-count one row. Uses the
    // service-role client so RLS can't turn a healthy DB into a false
    // negative.
    const { error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { status: "error", db: "unreachable", detail: error.message },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { status: "ok", db: "ok", ms: Date.now() - startedAt },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        db: "unreachable",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 }
    );
  }
}
