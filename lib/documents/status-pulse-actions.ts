"use server";

// ============================================================
// Documents — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/documents (and
// /ops/documents). Four counts surface "what to look at first":
//
//   1. Uploaded this week    — `documents.created_at >= Monday`.
//      Head count — keeps the wire small. Surfaces fresh additions
//      so the team can sanity-check titles / tags before the week
//      rolls on.
//   2. Pending review        — `documents` tagged with 'needs_review'.
//      Simple tag-driven inbox the team uses to flag drafts.
//   3. Expiring soon         — `documents.category = 'compliance'`
//      AND `created_at < today - 90 days`. Heuristic: a compliance
//      doc that hasn't been re-uploaded in 90+ days is approaching
//      its review window (WWCC etc. are annual but reviewing early
//      is cheap).
//   4. No tags               — `documents.tags is empty or null`.
//      Findability hygiene metric — untagged docs vanish from search.
//
// Implementation notes:
//   - Calls fan out in parallel via Promise.all.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.
//   - `head: true` head counts keep the wire small.
//   - `noTagsCount` uses Postgres `or()` for `tags is null` plus
//     `tags = '{}'::text[]` (the empty array form Supabase returns).

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface DocumentsStatusPulse {
  uploadedThisWeekCount: number;
  pendingReviewCount: number;
  expiringSoonCount: number;
  noTagsCount: number;
}

export async function getDocumentsStatusPulse(): Promise<DocumentsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();

    // 90-day cutoff for the compliance "expiring soon" heuristic.
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgoIso = ninetyDaysAgo.toISOString();

    // ============================================================
    // Fan out:
    //
    // 1. Uploaded this week  — head count where `created_at >= Monday`.
    // 2. Pending review      — head count where `tags @> 'needs_review'`.
    //                          Use .contains() for text[] array containment.
    // 3. Expiring soon       — head count where category='compliance'
    //                          AND created_at < 90 days ago.
    // 4. No tags             — head count where tags is null or empty.
    // ============================================================

    const [
      uploadedRes,
      pendingRes,
      expiringRes,
      noTagsRes,
    ] = await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mondayIso),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .contains("tags", ["needs_review"]),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("category", "compliance")
        .lt("created_at", ninetyDaysAgoIso),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .or("tags.is.null,tags.eq.{}"),
    ]);

    return {
      uploadedThisWeekCount: uploadedRes.count ?? 0,
      pendingReviewCount: pendingRes.count ?? 0,
      expiringSoonCount: expiringRes.count ?? 0,
      noTagsCount: noTagsRes.count ?? 0,
    };
  } catch (err) {
    console.error("getDocumentsStatusPulse error:", err);
    return {
      uploadedThisWeekCount: 0,
      pendingReviewCount: 0,
      expiringSoonCount: 0,
      noTagsCount: 0,
    };
  }
}
