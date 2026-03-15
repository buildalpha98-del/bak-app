import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { HealthScoreBreakdown, HealthScoreConfig } from "@/lib/types/database";
import type { HealthStatus } from "@/lib/types/enums";

// ============================================================
// Health Score Calculation Engine
// ============================================================

interface HealthScoreResult {
  score: number;
  status: HealthStatus;
  breakdown: HealthScoreBreakdown[];
}

function determineStatus(
  score: number,
  greenThreshold: number,
  amberThreshold: number
): HealthStatus {
  if (score >= greenThreshold) return "green";
  if (score >= amberThreshold) return "amber";
  return "red";
}

function scaleScore(
  value: number,
  min: number,
  max: number,
  minScore: number,
  maxScore: number
): number {
  if (value >= max) return maxScore;
  if (value <= min) return minScore;
  return minScore + ((value - min) / (max - min)) * (maxScore - minScore);
}

// ============================================================
// Individual signal calculators
// ============================================================

async function calcFeedbackRatings(
  centreId: string,
  threeMonthsAgo: string
): Promise<{ raw_value: number | null; signal_score: number }> {
  const supabase = createSupabaseAdmin();

  const { data: ratings } = await supabase
    .from("feedback_ratings")
    .select("rating")
    .eq("centre_id", centreId)
    .not("rating", "is", null)
    .gte("submitted_at", threeMonthsAgo);

  if (!ratings || ratings.length === 0) {
    return { raw_value: null, signal_score: 70 }; // Neutral
  }

  const avg = ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length;

  let score: number;
  if (avg >= 4.0) {
    score = 100;
  } else if (avg >= 3.0) {
    score = scaleScore(avg, 3.0, 3.9, 50, 99);
  } else {
    score = scaleScore(avg, 1.0, 2.9, 0, 49);
  }

  return { raw_value: Math.round(avg * 10) / 10, signal_score: Math.round(score) };
}

async function calcInvoicePayment(
  centreId: string
): Promise<{ raw_value: number | null; signal_score: number }> {
  const supabase = createSupabaseAdmin();

  // Get last 3 paid invoices with actual payment_date
  const { data: invoices } = await supabase
    .from("outbound_invoices")
    .select("sent_at, payment_date, status")
    .eq("centre_id", centreId)
    .eq("status", "paid")
    .not("sent_at", "is", null)
    .not("payment_date", "is", null)
    .order("payment_date", { ascending: false })
    .limit(3);

  if (!invoices || invoices.length === 0) {
    return { raw_value: null, signal_score: 70 }; // Neutral
  }

  // Calculate average days from sent_at to payment_date
  const daysToPay = invoices.map((inv) => {
    const sent = new Date(inv.sent_at!);
    const paid = new Date(inv.payment_date!);
    return Math.max(0, Math.floor((paid.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24)));
  });

  const avgDays = daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length;

  let score: number;
  if (avgDays <= 14) {
    score = 100;
  } else if (avgDays <= 30) {
    score = scaleScore(avgDays, 15, 30, 50, 99);
    // Invert: lower days = higher score
    score = 50 + (99 - score);
  } else {
    score = scaleScore(avgDays, 31, 60, 0, 49);
    score = 49 - score;
  }

  return { raw_value: Math.round(avgDays), signal_score: Math.round(Math.max(0, Math.min(100, score))) };
}

async function calcCancellationRate(
  centreId: string,
  threeMonthsAgo: string
): Promise<{ raw_value: number | null; signal_score: number }> {
  const supabase = createSupabaseAdmin();

  const { count: totalCount } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .gte("date", threeMonthsAgo.split("T")[0]);

  const { count: cancelledCount } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "cancelled")
    .gte("date", threeMonthsAgo.split("T")[0]);

  if (!totalCount || totalCount === 0) {
    return { raw_value: null, signal_score: 70 };
  }

  const rate = ((cancelledCount ?? 0) / totalCount) * 100;

  let score: number;
  if (rate < 5) {
    score = 100;
  } else if (rate <= 15) {
    score = scaleScore(rate, 5, 15, 50, 99);
    score = 50 + (99 - score); // Invert
  } else {
    score = scaleScore(rate, 15, 50, 0, 49);
    score = 49 - score;
  }

  return { raw_value: Math.round(rate * 10) / 10, signal_score: Math.round(Math.max(0, Math.min(100, score))) };
}

async function calcCommunication(
  centreId: string,
  threeMonthsAgo: string
): Promise<{ raw_value: number | null; signal_score: number }> {
  const supabase = createSupabaseAdmin();

  // Average time between feedback request created and submitted
  const { data: feedbacks } = await supabase
    .from("feedback_ratings")
    .select("created_at, submitted_at")
    .eq("centre_id", centreId)
    .not("submitted_at", "is", null)
    .gte("created_at", threeMonthsAgo);

  if (!feedbacks || feedbacks.length === 0) {
    return { raw_value: null, signal_score: 70 };
  }

  const hoursToRespond = feedbacks.map((f) => {
    const created = new Date(f.created_at);
    const submitted = new Date(f.submitted_at!);
    return Math.max(0, (submitted.getTime() - created.getTime()) / (1000 * 60 * 60));
  });

  const avgHours = hoursToRespond.reduce((a, b) => a + b, 0) / hoursToRespond.length;

  let score: number;
  if (avgHours < 48) {
    score = 100;
  } else if (avgHours <= 168) {
    // 7 days
    score = scaleScore(avgHours, 48, 168, 50, 99);
    score = 50 + (99 - score);
  } else {
    score = scaleScore(avgHours, 168, 720, 0, 49);
    score = 49 - score;
  }

  return { raw_value: Math.round(avgHours), signal_score: Math.round(Math.max(0, Math.min(100, score))) };
}

async function calcAttendanceTrends(
  centreId: string,
  threeMonthsAgo: string,
  sixMonthsAgo: string
): Promise<{ raw_value: number | null; signal_score: number }> {
  const supabase = createSupabaseAdmin();

  // Recent 3 months average headcount
  const { data: recentSessions } = await supabase
    .from("sessions")
    .select("headcount")
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .gte("date", threeMonthsAgo.split("T")[0])
    .not("headcount", "is", null);

  // Previous 3 months
  const { data: prevSessions } = await supabase
    .from("sessions")
    .select("headcount")
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .gte("date", sixMonthsAgo.split("T")[0])
    .lt("date", threeMonthsAgo.split("T")[0])
    .not("headcount", "is", null);

  if (!recentSessions || recentSessions.length < 3 || !prevSessions || prevSessions.length < 3) {
    return { raw_value: null, signal_score: 70 };
  }

  const recentAvg = recentSessions.reduce((s, r) => s + (r.headcount ?? 0), 0) / recentSessions.length;
  const prevAvg = prevSessions.reduce((s, r) => s + (r.headcount ?? 0), 0) / prevSessions.length;

  if (prevAvg === 0) {
    return { raw_value: null, signal_score: 70 };
  }

  const changePercent = ((recentAvg - prevAvg) / prevAvg) * 100;

  let score: number;
  if (changePercent > 5) {
    score = 100; // Growing
  } else if (changePercent >= -5) {
    score = 75; // Stable
  } else {
    score = scaleScore(changePercent, -30, -5, 0, 74);
  }

  return { raw_value: Math.round(changePercent * 10) / 10, signal_score: Math.round(Math.max(0, Math.min(100, score))) };
}

// ============================================================
// Main calculation function
// ============================================================

export async function calculateHealthScore(
  centreId: string,
  config?: HealthScoreConfig[]
): Promise<HealthScoreResult> {
  const supabase = createSupabaseAdmin();

  // Load config if not provided
  let signals = config;
  if (!signals) {
    const { data } = await supabase
      .from("health_score_config")
      .select("*")
      .order("signal_name");
    signals = (data ?? []) as HealthScoreConfig[];
  }

  // Build config map
  const configMap = new Map<string, HealthScoreConfig>();
  for (const s of signals) {
    configMap.set(s.signal_name, s);
  }

  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const threeMonthsAgoStr = threeMonthsAgo.toISOString();
  const sixMonthsAgoStr = sixMonthsAgo.toISOString();

  // Calculate all signals in parallel
  const [feedback, invoice, cancellation, communication, attendance] =
    await Promise.all([
      calcFeedbackRatings(centreId, threeMonthsAgoStr),
      calcInvoicePayment(centreId),
      calcCancellationRate(centreId, threeMonthsAgoStr),
      calcCommunication(centreId, threeMonthsAgoStr),
      calcAttendanceTrends(centreId, threeMonthsAgoStr, sixMonthsAgoStr),
    ]);

  const signalResults: Record<string, { raw_value: number | null; signal_score: number }> = {
    feedback_ratings: feedback,
    invoice_payment: invoice,
    cancellation_rate: cancellation,
    communication: communication,
    attendance_trends: attendance,
  };

  // Build breakdown and weighted sum
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: HealthScoreBreakdown[] = [];

  for (const [name, result] of Object.entries(signalResults)) {
    const cfg = configMap.get(name);
    const weight = cfg?.weight ?? 0;
    const greenThreshold = cfg?.green_threshold ?? 75;
    const amberThreshold = cfg?.amber_threshold ?? 50;

    weightedSum += result.signal_score * weight;
    totalWeight += weight;

    breakdown.push({
      signal_name: name,
      weight,
      raw_value: result.raw_value,
      signal_score: result.signal_score,
      status: determineStatus(result.signal_score, greenThreshold, amberThreshold),
    });
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 70;
  const overallStatus = determineStatus(overallScore, 75, 50);

  return {
    score: overallScore,
    status: overallStatus,
    breakdown,
  };
}

// ============================================================
// Calculate for all active centres
// ============================================================

export async function calculateAllHealthScores(): Promise<{
  results: { centreId: string; centreName: string; score: number; status: HealthStatus; previousStatus: HealthStatus | null }[];
  error: string | null;
}> {
  try {
    const supabase = createSupabaseAdmin();

    // Load config once
    const { data: config } = await supabase
      .from("health_score_config")
      .select("*")
      .order("signal_name");

    // Get all active centres
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name, health_status")
      .eq("contract_status", "active");

    if (!centres || centres.length === 0) {
      return { results: [], error: null };
    }

    const results: { centreId: string; centreName: string; score: number; status: HealthStatus; previousStatus: HealthStatus | null }[] = [];

    for (const centre of centres) {
      const previousStatus = centre.health_status as HealthStatus | null;
      const result = await calculateHealthScore(centre.id, config as HealthScoreConfig[]);

      // Store in health_scores history
      await supabase.from("health_scores").insert({
        centre_id: centre.id,
        score: result.score,
        status: result.status,
        breakdown_json: result.breakdown,
      });

      // Update centre snapshot
      await supabase
        .from("centres")
        .update({
          health_score: result.score,
          health_status: result.status,
          health_score_updated_at: new Date().toISOString(),
        })
        .eq("id", centre.id);

      // Check churn risk: red for 30+ consecutive days
      if (result.status === "red") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: recentScores } = await supabase
          .from("health_scores")
          .select("status")
          .eq("centre_id", centre.id)
          .gte("calculated_at", thirtyDaysAgo.toISOString())
          .order("calculated_at", { ascending: false });

        const allRed = recentScores && recentScores.length >= 2 && recentScores.every((s) => s.status === "red");
        if (allRed) {
          await supabase.from("centres").update({ churn_risk: true }).eq("id", centre.id);
        }
      } else {
        // Clear churn risk if no longer red
        await supabase.from("centres").update({ churn_risk: false }).eq("id", centre.id);
      }

      results.push({
        centreId: centre.id,
        centreName: centre.name,
        score: result.score,
        status: result.status,
        previousStatus,
      });
    }

    return { results, error: null };
  } catch (err) {
    console.error("calculateAllHealthScores error:", err);
    return { results: [], error: "Failed to calculate health scores." };
  }
}
