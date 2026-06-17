"use server";

// ============================================================
// Feedback — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/feedback (and
// /ops/feedback). Four counts surface "what to look at first":
//
//   1. New this week   — `feedback_ratings.submitted_at >= Monday`.
//      Head count of the freshly-arrived ratings inbox.
//   2. 1-star unack    — submitted_at IS NOT NULL AND rating = 1
//      AND acknowledged_at IS NULL. These are the urgent "must
//      respond today" rows.
//   3. 5-star unack    — same as (2) but rating = 5. Lighter touch:
//      a chance to thank the centre, share to the team, or mine
//      for a testimonial. Acknowledging clears it from the queue.
//   4. No response 24h — submitted_at IS NULL AND created_at older
//      than 24 hours. The feedback request went out but the centre
//      hasn't filled it in — chase by SMS or call.
//
// Implementation notes:
//   - `head: true` count queries throughout to avoid hauling rows.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page; mirrors forms / children / centres
//     pulse patterns.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface FeedbackStatusPulse {
  newThisWeekCount: number;
  oneStarUnackCount: number;
  fiveStarUnackCount: number;
  noResponseCount: number;
}

export async function getFeedbackStatusPulse(): Promise<FeedbackStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();

    // Anything created more than 24h ago and still unfilled is
    // considered "no response yet" for the chase queue.
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twentyFourHoursAgoIso = twentyFourHoursAgo.toISOString();

    const [newThisWeekRes, oneStarUnackRes, fiveStarUnackRes, noResponseRes] =
      await Promise.all([
        // (1) New ratings submitted since Monday.
        supabase
          .from("feedback_ratings")
          .select("id", { count: "exact", head: true })
          .gte("submitted_at", mondayIso),
        // (2) 1-star ratings still unacknowledged.
        supabase
          .from("feedback_ratings")
          .select("id", { count: "exact", head: true })
          .eq("rating", 1)
          .not("submitted_at", "is", null)
          .is("acknowledged_at", null),
        // (3) 5-star ratings still unacknowledged (thank/share queue).
        supabase
          .from("feedback_ratings")
          .select("id", { count: "exact", head: true })
          .eq("rating", 5)
          .not("submitted_at", "is", null)
          .is("acknowledged_at", null),
        // (4) Requests sent but not filled and now > 24h old.
        supabase
          .from("feedback_ratings")
          .select("id", { count: "exact", head: true })
          .is("submitted_at", null)
          .lt("created_at", twentyFourHoursAgoIso),
      ]);

    return {
      newThisWeekCount: newThisWeekRes.count ?? 0,
      oneStarUnackCount: oneStarUnackRes.count ?? 0,
      fiveStarUnackCount: fiveStarUnackRes.count ?? 0,
      noResponseCount: noResponseRes.count ?? 0,
    };
  } catch (err) {
    console.error("getFeedbackStatusPulse error:", err);
    return {
      newThisWeekCount: 0,
      oneStarUnackCount: 0,
      fiveStarUnackCount: 0,
      noResponseCount: 0,
    };
  }
}
