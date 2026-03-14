import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateCoachPerformance } from "@/lib/utils/performance/calculate";
import { checkBadgeEligibility, awardBadges } from "@/lib/utils/performance/badges";

/**
 * Monthly performance snapshot cron — runs 1st of each month at 22:00 UTC (08:00 AEST).
 * Calculates performance metrics for all active coaches for the previous month,
 * saves snapshots, and checks/awards new badges.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdmin();

    // Calculate previous month boundaries
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
    const periodStartStr = periodStart.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];

    // Get all active coaches
    const { data: coaches, error: coachErr } = await admin
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active");

    if (coachErr) throw coachErr;
    if (!coaches || coaches.length === 0) {
      return NextResponse.json({ snapshots: 0, badges: 0 });
    }

    let snapshotCount = 0;
    let badgeCount = 0;

    for (const coach of coaches) {
      try {
        // Calculate performance
        const { metrics, overall_score } = await calculateCoachPerformance(
          coach.id,
          periodStartStr,
          periodEndStr
        );

        // Insert snapshot
        const { error: snapErr } = await admin
          .from("coach_performance_snapshots")
          .insert({
            coach_id: coach.id,
            period_start: periodStartStr,
            period_end: periodEndStr,
            metrics_json: metrics,
            overall_score,
          });

        if (!snapErr) snapshotCount++;

        // Check and award badges
        const newBadges = await checkBadgeEligibility(coach.id);
        if (newBadges.length > 0) {
          await awardBadges(coach.id, newBadges);
          badgeCount += newBadges.length;
        }
      } catch (err) {
        console.error(`Performance snapshot failed for coach ${coach.id}:`, err);
      }
    }

    return NextResponse.json({
      period: `${periodStartStr} to ${periodEndStr}`,
      coaches_processed: coaches.length,
      snapshots: snapshotCount,
      badges_awarded: badgeCount,
    });
  } catch (err) {
    console.error("Performance snapshot cron error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
