"use server";

// ============================================================
// Forms — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/forms (and
// /ops/forms). Four counts surface "what to look at first":
//
//   1. Drafts pending    — `form_templates` rows where
//      `is_default = false` AND no `form_submissions` exist for
//      the template. Surfaces templates that someone built but
//      no coach has actually submitted yet — likely sitting in
//      review, or never wired into a workflow.
//   2. Submitted this    — `form_submissions.submitted_at >= Monday`.
//      week                Head count — the freshly-arrived inbox
//      that ops should glance over for incident / risk signals
//      before EOW.
//   3. Overdue            — heuristic: completed sessions in the
//      last 7 days minus distinct session_ids that have any
//      submission in the last 7 days. Clamped >= 0. Proxy for
//      "sessions where a session-linked form was probably
//      meant to be submitted but wasn't."
//   4. Archived this week — `form_templates` whose `name` starts
//      with `[Archived]` AND whose `updated_at >= Monday`. Since
//      the table has no `status` column, archived-ness is
//      encoded in the name prefix (see `bulkArchiveTemplates`).
//
// Implementation notes:
//   - Calls fan out in parallel via Promise.all.
//   - Errors swallow to zeros so a single broken sub-query
//     doesn't blank the whole page.
//   - `head: true` head counts keep the wire small wherever
//     possible.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface FormsStatusPulse {
  draftsPendingCount: number;
  submittedThisWeekCount: number;
  overdueCount: number;
  archivedThisWeekCount: number;
}

export async function getFormsStatusPulse(): Promise<FormsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();
    const mondayDate = mondayIso.slice(0, 10);

    // 7-day window for the "overdue" heuristic.
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();
    const sevenDaysAgoDate = sevenDaysAgoIso.slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    // ============================================================
    // Fan out:
    //
    // 1. Submitted this week — head count of `form_submissions`
    //    with `submitted_at >= Monday`.
    // 2. Archived this week  — head count of `form_templates`
    //    with `name ilike '[Archived]%' AND updated_at >= Monday`.
    // 3. Non-default templates — id list of templates where
    //    `is_default = false`. Drives the drafts-pending derivation.
    // 4. All submissions ever — distinct `form_template_id` set.
    //    Used to subtract from #3 (templates with zero submissions).
    // 5. Completed sessions in last 7d — id + date list for the
    //    overdue heuristic.
    // 6. Submissions in last 7d  — distinct session_id set for the
    //    overdue heuristic.
    // ============================================================

    const [
      submittedRes,
      archivedRes,
      nonDefaultTemplatesRes,
      allSubmittedTemplateIdsRes,
      recentSessionsRes,
      recentSubmissionsRes,
    ] = await Promise.all([
      supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .gte("submitted_at", mondayIso),
      supabase
        .from("form_templates")
        .select("id", { count: "exact", head: true })
        .ilike("name", "[Archived]%")
        .gte("updated_at", mondayIso),
      supabase
        .from("form_templates")
        .select("id")
        .eq("is_default", false),
      supabase
        .from("form_submissions")
        .select("form_template_id"),
      supabase
        .from("sessions")
        .select("id")
        .gte("date", sevenDaysAgoDate)
        .lte("date", today)
        .eq("status", "completed"),
      supabase
        .from("form_submissions")
        .select("session_id")
        .gte("submitted_at", sevenDaysAgoIso)
        .not("session_id", "is", null),
    ]);

    const submittedThisWeekCount = submittedRes.count ?? 0;
    const archivedThisWeekCount = archivedRes.count ?? 0;

    // (3 + 4) Drafts pending — non-default templates with zero
    //         submissions ever.
    const submittedTemplateIds = new Set<string>();
    for (const row of allSubmittedTemplateIdsRes.data ?? []) {
      const r = row as { form_template_id: string };
      submittedTemplateIds.add(r.form_template_id);
    }
    let draftsPendingCount = 0;
    for (const row of nonDefaultTemplatesRes.data ?? []) {
      const r = row as { id: string };
      if (!submittedTemplateIds.has(r.id)) {
        draftsPendingCount += 1;
      }
    }

    // (5 + 6) Overdue — completed-sessions-in-7d minus distinct
    //         session_ids covered by a submission in 7d. Clamped.
    const recentSessionIds = new Set<string>();
    for (const row of recentSessionsRes.data ?? []) {
      const r = row as { id: string };
      recentSessionIds.add(r.id);
    }
    const coveredSessionIds = new Set<string>();
    for (const row of recentSubmissionsRes.data ?? []) {
      const r = row as { session_id: string | null };
      if (r.session_id) coveredSessionIds.add(r.session_id);
    }
    let overdueCount = 0;
    for (const id of recentSessionIds) {
      if (!coveredSessionIds.has(id)) overdueCount += 1;
    }
    if (overdueCount < 0) overdueCount = 0;

    return {
      draftsPendingCount,
      submittedThisWeekCount,
      overdueCount,
      archivedThisWeekCount,
    };
  } catch (err) {
    console.error("getFormsStatusPulse error:", err);
    return {
      draftsPendingCount: 0,
      submittedThisWeekCount: 0,
      overdueCount: 0,
      archivedThisWeekCount: 0,
    };
  }
}
