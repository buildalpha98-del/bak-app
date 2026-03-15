import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { RiskLevel } from "@/lib/types/enums";

// ============================================================
// Churn Risk Engine — rules-based scoring for centre churn risk
// ============================================================

interface RiskIndicator {
  score: number;
  weight: number;
  detail: string;
}

export interface ChurnRiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  indicators: Record<string, RiskIndicator>;
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 76) return "critical";
  if (score >= 51) return "high";
  if (score >= 26) return "medium";
  return "low";
}

/**
 * Calculate churn risk for a given centre.
 * Uses a rules-based scoring engine across 6 weighted factors.
 */
export async function calculateChurnRisk(
  centreId: string
): Promise<ChurnRiskResult> {
  const admin = createSupabaseAdmin();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Fetch all data in parallel
  const [
    centreResult,
    recentSessionsResult,
    previousSessionsResult,
    lastFeedbackResult,
    lastNoteResult,
    overdueInvoicesResult,
    cancelledSessionsResult,
    totalSessionsResult,
  ] = await Promise.all([
    // Centre health score + created_at for tenure
    admin
      .from("centres")
      .select("health_score, created_at")
      .eq("id", centreId)
      .single(),
    // Sessions in last 30 days
    admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
      .neq("status", "cancelled"),
    // Sessions in previous 30 days (30-60 days ago)
    admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .gte("date", sixtyDaysAgo.toISOString().split("T")[0])
      .lt("date", thirtyDaysAgo.toISOString().split("T")[0])
      .neq("status", "cancelled"),
    // Most recent feedback rating
    admin
      .from("feedback_ratings")
      .select("created_at")
      .eq("centre_id", centreId)
      .order("created_at", { ascending: false })
      .limit(1),
    // Most recent centre note
    admin
      .from("centre_notes")
      .select("created_at")
      .eq("centre_id", centreId)
      .order("created_at", { ascending: false })
      .limit(1),
    // Overdue invoices > 30 days
    admin
      .from("outbound_invoices")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .neq("status", "paid")
      .lt("due_date", thirtyDaysAgo.toISOString().split("T")[0]),
    // Cancelled sessions in last 60 days
    admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .gte("date", sixtyDaysAgo.toISOString().split("T")[0])
      .eq("status", "cancelled"),
    // Total sessions in last 60 days (all statuses)
    admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .gte("date", sixtyDaysAgo.toISOString().split("T")[0]),
  ]);

  const indicators: Record<string, RiskIndicator> = {};

  // --- 1. Health Score Factor (30%) ---
  const healthScore = centreResult.data?.health_score ?? 50;
  let healthRisk: number;
  if (healthScore < 50) {
    healthRisk = 90 + (50 - healthScore); // high risk, capped at 100
  } else if (healthScore < 75) {
    healthRisk = 30 + ((75 - healthScore) / 25) * 40; // 30-70 range
  } else {
    healthRisk = Math.max(0, 30 - ((healthScore - 75) / 25) * 30); // 0-30 range
  }
  healthRisk = Math.min(100, Math.max(0, healthRisk));
  indicators.health_score = {
    score: healthRisk,
    weight: 0.3,
    detail: `Health score: ${healthScore}/100. ${healthScore < 50 ? "High risk" : healthScore < 75 ? "Medium risk" : "Low risk"}`,
  };

  // --- 2. Engagement Trend (20%) ---
  const recentCount = recentSessionsResult.count ?? 0;
  const previousCount = previousSessionsResult.count ?? 0;
  let engagementRisk: number;
  if (previousCount === 0 && recentCount === 0) {
    engagementRisk = 70; // no activity at all
  } else if (previousCount === 0) {
    engagementRisk = 10; // new engagement, positive sign
  } else {
    const changePercent =
      ((recentCount - previousCount) / previousCount) * 100;
    if (changePercent <= -20) {
      engagementRisk = 80 + Math.min(20, Math.abs(changePercent) - 20); // 80-100
    } else if (changePercent < 0) {
      engagementRisk = 40 + (Math.abs(changePercent) / 20) * 40; // 40-80
    } else {
      engagementRisk = Math.max(0, 40 - changePercent * 2); // 0-40
    }
  }
  engagementRisk = Math.min(100, Math.max(0, engagementRisk));
  const changeStr =
    previousCount > 0
      ? `${(((recentCount - previousCount) / previousCount) * 100).toFixed(0)}%`
      : "N/A";
  indicators.engagement_trend = {
    score: engagementRisk,
    weight: 0.2,
    detail: `Sessions: ${recentCount} (last 30d) vs ${previousCount} (prev 30d). Change: ${changeStr}`,
  };

  // --- 3. Communication (15%) ---
  const lastFeedbackDate = lastFeedbackResult.data?.[0]?.created_at;
  const lastNoteDate = lastNoteResult.data?.[0]?.created_at;
  const lastCommunication = [lastFeedbackDate, lastNoteDate]
    .filter(Boolean)
    .sort()
    .reverse()[0];

  let daysSinceCommunication: number;
  let communicationRisk: number;
  if (!lastCommunication) {
    daysSinceCommunication = 999;
    communicationRisk = 80;
  } else {
    daysSinceCommunication = Math.floor(
      (now.getTime() - new Date(lastCommunication).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysSinceCommunication > 30) {
      communicationRisk = 80 + Math.min(20, (daysSinceCommunication - 30) / 3);
    } else if (daysSinceCommunication > 14) {
      communicationRisk =
        40 + ((daysSinceCommunication - 14) / 16) * 40;
    } else {
      communicationRisk = (daysSinceCommunication / 14) * 40;
    }
  }
  communicationRisk = Math.min(100, Math.max(0, communicationRisk));
  indicators.communication = {
    score: communicationRisk,
    weight: 0.15,
    detail: `Days since last feedback/note: ${daysSinceCommunication === 999 ? "Never" : daysSinceCommunication}. ${daysSinceCommunication > 30 ? "High risk" : daysSinceCommunication > 14 ? "Medium risk" : "Low risk"}`,
  };

  // --- 4. Payment (15%) ---
  const overdueCount = overdueInvoicesResult.count ?? 0;
  let paymentRisk: number;
  if (overdueCount > 0) {
    paymentRisk = 80 + Math.min(20, overdueCount * 10);
  } else {
    paymentRisk = 0;
  }
  paymentRisk = Math.min(100, Math.max(0, paymentRisk));
  indicators.payment = {
    score: paymentRisk,
    weight: 0.15,
    detail: `Overdue invoices (>30 days): ${overdueCount}. ${overdueCount > 0 ? "High risk" : "Low risk"}`,
  };

  // --- 5. Cancellation Rate (10%) ---
  const cancelledCount = cancelledSessionsResult.count ?? 0;
  const totalCount = totalSessionsResult.count ?? 0;
  const cancellationRate =
    totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;
  let cancellationRisk: number;
  if (cancellationRate > 20) {
    cancellationRisk = 80 + Math.min(20, (cancellationRate - 20) * 2);
  } else if (cancellationRate > 10) {
    cancellationRisk = 40 + ((cancellationRate - 10) / 10) * 40;
  } else {
    cancellationRisk = cancellationRate * 4;
  }
  cancellationRisk = Math.min(100, Math.max(0, cancellationRisk));
  indicators.cancellation_rate = {
    score: cancellationRisk,
    weight: 0.1,
    detail: `Cancellation rate: ${cancellationRate.toFixed(1)}% (${cancelledCount}/${totalCount} in last 60 days)`,
  };

  // --- 6. Relationship / Tenure (10%) ---
  const centreCreatedAt = centreResult.data?.created_at;
  let tenureMonths = 12; // default
  if (centreCreatedAt) {
    tenureMonths = Math.floor(
      (now.getTime() - new Date(centreCreatedAt).getTime()) /
        (1000 * 60 * 60 * 24 * 30)
    );
  }
  let tenureRisk: number;
  if (tenureMonths < 3) {
    tenureRisk = 60;
  } else if (tenureMonths < 6) {
    tenureRisk = 40;
  } else if (tenureMonths < 12) {
    tenureRisk = 20;
  } else {
    tenureRisk = 10;
  }
  indicators.relationship = {
    score: tenureRisk,
    weight: 0.1,
    detail: `Tenure: ${tenureMonths} months. ${tenureMonths < 3 ? "New centre — higher risk" : tenureMonths < 6 ? "Developing relationship" : "Established"}`,
  };

  // --- Weighted score ---
  let rawScore = 0;
  for (const key of Object.keys(indicators)) {
    rawScore += indicators[key].score * indicators[key].weight;
  }

  // Apply tenure multiplier for new centres
  const tenureMultiplier = tenureMonths < 3 ? 1.2 : 1.0;
  const finalScore = Math.min(100, Math.round(rawScore * tenureMultiplier));

  return {
    riskScore: finalScore,
    riskLevel: getRiskLevel(finalScore),
    indicators,
  };
}
