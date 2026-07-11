import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateChurnRisk } from "@/lib/utils/churnRisk";
import type { RiskLevel } from "@/lib/types/enums";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdmin();
    const today = new Date().toISOString().split("T")[0];

    // Fetch all active centres
    const { data: centres, error: centresError } = await admin
      .from("centres")
      .select("id, name, contract_status")
      .in("contract_status", ["active", "trial"]);

    if (centresError) throw centresError;

    let processed = 0;
    let riskChanges = 0;
    let criticalAlerts = 0;
    let highAlerts = 0;

    for (const centre of centres ?? []) {
      try {
        // Calculate risk
        const result = await calculateChurnRisk(centre.id);

        // Get previous snapshot for comparison
        const { data: prevSnapshot } = await admin
          .from("churn_risk_indicators")
          .select("risk_score, risk_level")
          .eq("centre_id", centre.id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single();

        const previousLevel = (prevSnapshot?.risk_level as RiskLevel) ?? null;

        // Calculate days since last feedback and communication
        const now = new Date();
        const feedbackIndicator = result.indicators.communication;
        const daysSinceMatch = feedbackIndicator?.detail.match(
          /Days since last feedback\/note: (\d+|Never)/
        );
        const daysSinceFeedback =
          daysSinceMatch?.[1] === "Never"
            ? null
            : daysSinceMatch?.[1]
              ? parseInt(daysSinceMatch[1])
              : null;

        // Determine session trend
        const engagementIndicator = result.indicators.engagement_trend;
        const trendMatch = engagementIndicator?.detail.match(/Change: ([-\d.]+%|N\/A)/);
        const sessionTrend = trendMatch?.[1] ?? "N/A";

        // Determine health trend based on previous snapshot
        let healthTrend = "stable";
        if (prevSnapshot) {
          const currentHealth = result.indicators.health_score?.score ?? 0;
          const prevHealth = prevSnapshot.risk_score ?? 0;
          if (result.riskScore > prevSnapshot.risk_score + 5) healthTrend = "declining";
          else if (result.riskScore < prevSnapshot.risk_score - 5) healthTrend = "improving";
        }

        // Save snapshot
        const { error: insertError } = await admin
          .from("churn_risk_indicators")
          .insert({
            centre_id: centre.id,
            snapshot_date: today,
            risk_score: result.riskScore,
            risk_level: result.riskLevel,
            health_score: result.indicators.health_score
              ? Math.round(100 - result.indicators.health_score.score)
              : null,
            health_trend: healthTrend,
            engagement_score: result.indicators.engagement_trend
              ? Math.round(100 - result.indicators.engagement_trend.score)
              : null,
            communication_score: result.indicators.communication
              ? Math.round(100 - result.indicators.communication.score)
              : null,
            payment_score: result.indicators.payment
              ? Math.round(100 - result.indicators.payment.score)
              : null,
            cancellation_rate: result.indicators.cancellation_rate
              ? parseFloat(
                  (
                    result.indicators.cancellation_rate.detail.match(
                      /Cancellation rate: ([\d.]+)%/
                    )?.[1] ?? "0"
                  )
                )
              : null,
            session_trend: sessionTrend,
            days_since_last_feedback: daysSinceFeedback,
            days_since_last_communication: daysSinceFeedback,
            indicators_json: result.indicators,
          });

        if (insertError) {
          console.error(
            `Failed to save snapshot for centre ${centre.id}:`,
            insertError
          );
          continue;
        }

        processed++;

        // Check if risk level changed
        if (previousLevel && previousLevel !== result.riskLevel) {
          riskChanges++;

          // Create churn event for level change
          await admin.from("churn_events").insert({
            centre_id: centre.id,
            event_type:
              result.riskLevel === "critical" || result.riskLevel === "high"
                ? "at_risk"
                : previousLevel === "critical" || previousLevel === "high"
                  ? "recovered"
                  : "at_risk",
            risk_score: result.riskScore,
            risk_level: result.riskLevel,
            indicators: result.indicators,
            notes: `Risk level changed from ${previousLevel} to ${result.riskLevel}`,
            detected_at: new Date().toISOString(),
          });

          // Critical: auto-create task for ops
          if (result.riskLevel === "critical") {
            criticalAlerts++;
            try {
              const { autoCreateTask } = await import(
                "@/lib/tasks/auto-create"
              );
              await autoCreateTask({
                title: `Review ${centre.name} — critical churn risk`,
                description: `${centre.name} has reached critical churn risk (score: ${result.riskScore}/100). Top factors: ${Object.entries(result.indicators)
                  .sort(
                    ([, a], [, b]) => b.score * b.weight - a.score * a.weight
                  )
                  .slice(0, 3)
                  .map(([key, ind]) => `${key.replace(/_/g, " ")} (${Math.round(ind.score)}%)`)
                  .join(", ")}.`,
                priority: "urgent",
                linkedEntityType: "centre",
                linkedEntityId: centre.id,
                source: "churn_risk",
              });
            } catch (taskErr) {
              console.error(
                `Failed to create task for centre ${centre.id}:`,
                taskErr
              );
            }
          }

          // High: send notification to admin
          if (result.riskLevel === "high") {
            highAlerts++;
            try {
              const { triggerNotificationForOps } = await import(
                "@/lib/notifications/send"
              );
              await triggerNotificationForOps({
                type: "task_assigned",
                title: `High churn risk: ${centre.name}`,
                body: `${centre.name} has moved to high churn risk (score: ${result.riskScore}/100). Previous level: ${previousLevel}.`,
                entityType: "centre",
                entityId: centre.id,
              });
            } catch (notifErr) {
              console.error(
                `Failed to send notification for centre ${centre.id}:`,
                notifErr
              );
            }
          }
        }
      } catch (centreErr) {
        console.error(
          `Error processing centre ${centre.id}:`,
          centreErr
        );
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      total: centres?.length ?? 0,
      riskChanges,
      criticalAlerts,
      highAlerts,
      date: today,
    });
  } catch (error) {
    console.error("Churn risk cron error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
