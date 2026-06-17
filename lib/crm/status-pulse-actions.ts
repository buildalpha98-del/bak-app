"use server";

// ============================================================
// CRM status pulse — counts powering the inline pulse strip
// ============================================================
//
// Cheap counts, computed in parallel. Mirrors the centres + roster
// status pulse pattern (a handful of `count: 'exact', head: true`
// queries) scoped to lead signals: stale leads, overdue follow-ups,
// trials ending this week, and hot leads (recent email engagement).
//
// The four counts each link-to-filter on the pipeline board via a
// query param the board reads and treats as a derived filter chip.

import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACTIVE_STAGES = [
  "cold_lead",
  "contacted",
  "interested",
  "free_trial",
  "proposal_sent",
] as const;

export interface CrmStatusPulse {
  /** Active-stage leads with no activity (any lead_activities row) in 7+ days. */
  staleCount: number;
  /** Leads with next_follow_up_date < now (overdue). */
  overdueFollowupCount: number;
  /** Leads in free_trial stage whose trial_end_date is within Mon-Sun of THIS week. */
  trialsEndingThisWeekCount: number;
  /** Leads with at least one email_opened/email_clicked activity in the last 48h. */
  hotLeadsCount: number;
}

/**
 * Compute the headline four counts for the CRM pulse strip.
 *
 * Stale and hot leads are derived from `lead_activities`. We pull only
 * the (lead_id, type, created_at) projection so the wire payload stays
 * small even when the activities table grows.
 */
export async function getCrmStatusPulse(): Promise<CrmStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const nowIso = now.toISOString();

    // 7-day cutoff for "stale" — active leads with no activity in the
    // last week. We do this by pulling active lead ids + a recent
    // activity projection, then doing the set-difference in memory.
    const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgoIso = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // This week's Mon → Sun window (Australian week). The brief says
    // "Mon-Sun of the current week" — we mirror the rest of the app's
    // week-starts-Monday convention.
    const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = (day + 6) % 7; // 0 when Mon, 6 when Sun
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - daysFromMonday);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const mondayDate = monday.toISOString().split("T")[0];
    const sundayDate = sunday.toISOString().split("T")[0];

    // Fan out the cheap queries. Two head-count queries (overdue
    // follow-ups, trials ending), and two projections (active lead
    // ids + recent activity ids) for the stale/hot derivations.
    const [
      overdueRes,
      trialsRes,
      activeLeadsRes,
      recentActivityRes,
      hotActivityRes,
    ] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .lt("next_follow_up_date", nowIso)
        .not("next_follow_up_date", "is", null)
        .in("stage", ACTIVE_STAGES as unknown as string[]),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("stage", "free_trial")
        .gte("trial_end_date", mondayDate)
        .lte("trial_end_date", sundayDate),
      supabase
        .from("leads")
        .select("id, created_at")
        .in("stage", ACTIVE_STAGES as unknown as string[]),
      supabase
        .from("lead_activities")
        .select("lead_id")
        .gte("created_at", sevenDaysAgoIso),
      supabase
        .from("lead_activities")
        .select("lead_id")
        .in("type", ["email_opened", "email_clicked"])
        .gte("created_at", fortyEightHoursAgoIso),
    ]);

    // Stale = active leads with no activity in the last 7 days.
    // We also treat leads created within the last 7 days as "fresh"
    // (not stale) even when they have no activity yet — a brand-new
    // lead shouldn't immediately read as needing attention.
    const recentlyActiveIds = new Set(
      (recentActivityRes.data ?? []).map((r) => r.lead_id as string)
    );
    let staleCount = 0;
    for (const row of activeLeadsRes.data ?? []) {
      const createdAt = new Date(row.created_at as string);
      if (createdAt.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000) continue;
      if (!recentlyActiveIds.has(row.id as string)) staleCount++;
    }

    // Hot = distinct leads with at least one email_opened/email_clicked
    // activity in the last 48h.
    const hotIds = new Set(
      (hotActivityRes.data ?? []).map((r) => r.lead_id as string)
    );

    return {
      staleCount,
      overdueFollowupCount: overdueRes.count ?? 0,
      trialsEndingThisWeekCount: trialsRes.count ?? 0,
      hotLeadsCount: hotIds.size,
    };
  } catch (err) {
    console.error("getCrmStatusPulse error:", err);
    return {
      staleCount: 0,
      overdueFollowupCount: 0,
      trialsEndingThisWeekCount: 0,
      hotLeadsCount: 0,
    };
  }
}

/**
 * Return the set of lead IDs with at least one email_opened or
 * email_clicked activity in the last 48 hours. Used by the pipeline
 * board to render the hot-lead flame indicator without an N+1.
 *
 * Called from the page-level `Promise.all` alongside `getLeads` so the
 * single round-trip projection lives next to the leads list rather than
 * inflating each lead row.
 */
export async function getHotLeadIds(): Promise<string[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const fortyEightHoursAgoIso = new Date(
      Date.now() - 48 * 60 * 60 * 1000
    ).toISOString();

    const { data } = await supabase
      .from("lead_activities")
      .select("lead_id")
      .in("type", ["email_opened", "email_clicked"])
      .gte("created_at", fortyEightHoursAgoIso);

    const set = new Set((data ?? []).map((r) => r.lead_id as string));
    return Array.from(set);
  } catch (err) {
    console.error("getHotLeadIds error:", err);
    return [];
  }
}

export interface SequencesSummary {
  activeSequencesCount: number;
  emailsSentThisWeek: number;
}

/**
 * Headline figures for the email-sequences summary card. Active
 * sequences (is_active=true) and the count of email_sends with
 * sent_at within the last 7 days. The brief mentions a reply rate
 * but the schema has no reply_at column, so we omit it and surface
 * only the two figures we can compute cleanly.
 */
export async function getSequencesSummary(): Promise<SequencesSummary> {
  try {
    const supabase = await createSupabaseServerClient();
    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [activeRes, sentRes] = await Promise.all([
      supabase
        .from("email_sequences")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("email_sends")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", sevenDaysAgoIso)
        .not("sent_at", "is", null),
    ]);

    return {
      activeSequencesCount: activeRes.count ?? 0,
      emailsSentThisWeek: sentRes.count ?? 0,
    };
  } catch (err) {
    console.error("getSequencesSummary error:", err);
    return { activeSequencesCount: 0, emailsSentThisWeek: 0 };
  }
}
