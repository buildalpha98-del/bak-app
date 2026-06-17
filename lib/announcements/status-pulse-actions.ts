"use server";

// ============================================================
// Announcements dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N sent this week · M sent this month · K low
// read (<30%) · F unread by me" strip above /admin/announcements.
//
// Schema note: the `announcements` table doesn't model
// drafts/scheduled today — everything published becomes immediately
// visible. The pulse surfaces meaningful counts against the data
// we do have so the operator sees the engagement loop.
//
// Implementation notes:
//   - Sent this week: announcements where created_at >= Monday.
//   - Sent this month: announcements where created_at >= first of month.
//   - Low-read: announcements posted in the last 30d with <30%
//     read rate (read_count / audience_count). Cap at active
//     profiles to match the existing read-count logic.
//   - Unread (mine): announcements not yet in announcement_reads
//     for the current user.
//   - Errors swallow to zeros.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface AnnouncementsStatusPulse {
  sentThisWeekCount: number;
  sentThisMonthCount: number;
  lowReadCount: number;
  unreadByMeCount: number;
}

export async function getAnnouncementsStatusPulse(): Promise<AnnouncementsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthIso = startOfMonth.toISOString();

    const thirtyDaysAgoIso = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [
      sentThisWeekRes,
      sentThisMonthRes,
      lowReadCandidatesRes,
      activeProfilesRes,
    ] = await Promise.all([
      supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mondayIso),
      supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthIso),
      supabase
        .from("announcements")
        .select("id, audience")
        .gte("created_at", thirtyDaysAgoIso),
      supabase
        .from("profiles")
        .select("role")
        .eq("status", "active"),
    ]);

    // Compute low-read counts. For each announcement: count reads,
    // compute audience size, mark "low" if rate <30%.
    const lowReadCandidates = lowReadCandidatesRes.data ?? [];
    const activeProfiles = activeProfilesRes.data ?? [];
    const audienceSize: Record<string, number> = {
      all: activeProfiles.length,
      coaches_only: activeProfiles.filter((p) => p.role === "coach").length,
      ops_and_coaches: activeProfiles.filter(
        (p) => p.role === "ops" || p.role === "coach"
      ).length,
    };

    let lowReadCount = 0;
    for (const ann of lowReadCandidates) {
      const audience = (ann.audience as string) ?? "all";
      const audSize = audienceSize[audience] ?? activeProfiles.length;
      if (audSize === 0) continue;
      const { count: readCount } = await supabase
        .from("announcement_reads")
        .select("id", { count: "exact", head: true })
        .eq("announcement_id", ann.id);
      const rate = (readCount ?? 0) / audSize;
      if (rate < 0.3) lowReadCount += 1;
    }

    // Unread by me: count of announcements that the current user
    // doesn't have a read receipt for. Best-effort — falls back to 0
    // if there's no authenticated user.
    let unreadByMeCount = 0;
    if (user) {
      const { data: allRecent } = await supabase
        .from("announcements")
        .select("id")
        .gte("created_at", thirtyDaysAgoIso);
      const ids = (allRecent ?? []).map((r) => r.id as string);
      if (ids.length > 0) {
        const { data: myReads } = await supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("user_id", user.id)
          .in("announcement_id", ids);
        const readIds = new Set(
          (myReads ?? []).map((r) => r.announcement_id as string)
        );
        unreadByMeCount = ids.filter((id) => !readIds.has(id)).length;
      }
    }

    return {
      sentThisWeekCount: sentThisWeekRes.count ?? 0,
      sentThisMonthCount: sentThisMonthRes.count ?? 0,
      lowReadCount,
      unreadByMeCount,
    };
  } catch (err) {
    console.error("getAnnouncementsStatusPulse error:", err);
    return {
      sentThisWeekCount: 0,
      sentThisMonthCount: 0,
      lowReadCount: 0,
      unreadByMeCount: 0,
    };
  }
}
