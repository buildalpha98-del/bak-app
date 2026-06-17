"use server";

// ============================================================
// Reports — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/reports (and
// /ops/reports). Four counts surface "what needs reviewing":
//
//   1. Drafts                  — `centre_reports` rows with status='draft'.
//                                Sitting in the editor, not yet sent.
//   2. Sent this week          — `centre_reports.sent_at >= Monday`. The
//                                outgoing flow ops should keep eyes on.
//   3. Overdue                 — drafts older than 14 days. Long-standing
//                                drafts that have likely been forgotten.
//   4. Centres without report  — active centres (contract_status in
//                                ['active','trial']) that have NO
//                                centre_reports row for the active term.
//                                Tells ops which centres still need a
//                                term report generated.
//
// Implementation notes:
//   - Calls fan out in parallel via Promise.all.
//   - `head: true` head counts wherever possible to keep the wire small.
//   - Errors swallow to zeros so a single broken sub-query doesn't blank
//     the whole page.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface ReportsStatusPulse {
  draftsCount: number;
  sentThisWeekCount: number;
  overdueCount: number;
  centresWithoutReportCount: number;
}

export async function getReportsStatusPulse(): Promise<ReportsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();

    // 14-day cutoff for the "overdue draft" heuristic.
    const fourteenDaysAgo = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000
    );
    const fourteenDaysAgoIso = fourteenDaysAgo.toISOString();

    // ============================================================
    // Fan out:
    //
    // 1. Drafts             — head count of centre_reports.status='draft'.
    // 2. Sent this week     — head count of centre_reports.sent_at>=Monday.
    // 3. Overdue            — head count of centre_reports where
    //                         status='draft' AND created_at < now-14d.
    // 4. Active centres     — id list of centres with contract_status in
    //                         ['active','trial']. Used to compute the
    //                         "centres without report" bucket.
    // 5. Active term        — id of the term currently active. Reports
    //                         are scoped per-term.
    // 6. All term reports   — id list of centre_ids that have a report
    //                         for the active term. Subtracts from (4)
    //                         to derive the "without report" bucket.
    // ============================================================

    const [
      draftsRes,
      sentRes,
      overdueRes,
      activeCentresRes,
      activeTermRes,
    ] = await Promise.all([
      supabase
        .from("centre_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      supabase
        .from("centre_reports")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", mondayIso),
      supabase
        .from("centre_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft")
        .lt("created_at", fourteenDaysAgoIso),
      supabase
        .from("centres")
        .select("id")
        .in("contract_status", ["active", "trial"]),
      supabase
        .from("terms")
        .select("id")
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);

    const draftsCount = draftsRes.count ?? 0;
    const sentThisWeekCount = sentRes.count ?? 0;
    const overdueCount = overdueRes.count ?? 0;

    // (4 + 5 + 6) Centres-without-report — only computable if there's
    //              an active term. Otherwise zero.
    let centresWithoutReportCount = 0;
    const activeTermId = (activeTermRes.data as { id: string } | null)?.id;

    if (activeTermId) {
      const reportsForTermRes = await supabase
        .from("centre_reports")
        .select("centre_id")
        .eq("term_id", activeTermId);

      const centresWithReport = new Set<string>();
      for (const row of reportsForTermRes.data ?? []) {
        const r = row as { centre_id: string };
        centresWithReport.add(r.centre_id);
      }

      for (const row of activeCentresRes.data ?? []) {
        const r = row as { id: string };
        if (!centresWithReport.has(r.id)) {
          centresWithoutReportCount += 1;
        }
      }
    }

    return {
      draftsCount,
      sentThisWeekCount,
      overdueCount,
      centresWithoutReportCount,
    };
  } catch (err) {
    console.error("getReportsStatusPulse error:", err);
    return {
      draftsCount: 0,
      sentThisWeekCount: 0,
      overdueCount: 0,
      centresWithoutReportCount: 0,
    };
  }
}

// ============================================================
// getCentresWithoutReport — used by the missing_report jump filter
// ============================================================
//
// Returns the active centres that don't yet have a report for the active
// term. The list view replaces the table with this when ?missing_report=yes
// is active.

export interface CentreWithoutReport {
  id: string;
  name: string;
  term_id: string | null;
  term_name: string | null;
}

export async function getCentresWithoutReport(): Promise<{
  data: CentreWithoutReport[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const activeTermRes = await supabase
      .from("terms")
      .select("id, name")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const activeTerm = activeTermRes.data as
      | { id: string; name: string }
      | null;

    if (!activeTerm) {
      return { data: [], error: null };
    }

    const [centresRes, reportsRes] = await Promise.all([
      supabase
        .from("centres")
        .select("id, name")
        .in("contract_status", ["active", "trial"])
        .order("name"),
      supabase
        .from("centre_reports")
        .select("centre_id")
        .eq("term_id", activeTerm.id),
    ]);

    const centresWithReport = new Set<string>();
    for (const row of reportsRes.data ?? []) {
      const r = row as { centre_id: string };
      centresWithReport.add(r.centre_id);
    }

    const data: CentreWithoutReport[] = [];
    for (const row of centresRes.data ?? []) {
      const r = row as { id: string; name: string };
      if (!centresWithReport.has(r.id)) {
        data.push({
          id: r.id,
          name: r.name,
          term_id: activeTerm.id,
          term_name: activeTerm.name,
        });
      }
    }

    return { data, error: null };
  } catch (err) {
    console.error("getCentresWithoutReport error:", err);
    return { data: [], error: "Failed to load centres without report." };
  }
}
