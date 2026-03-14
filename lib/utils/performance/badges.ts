import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CoachBadge } from "@/lib/types/database";

export const BADGE_DEFINITIONS = {
  fifty_sessions: {
    name: "50 Sessions Club",
    description: "Completed 50+ sessions",
    icon: "trophy",
  },
  century_coach: {
    name: "Century Coach",
    description: "Completed 100+ sessions",
    icon: "award",
  },
  five_star: {
    name: "Five Star",
    description: "Average rating >= 4.8 over 20+ sessions",
    icon: "star",
  },
  perfect_punctuality: {
    name: "Perfect Punctuality",
    description: "Zero late starts in a calendar month",
    icon: "clock",
  },
  form_champion: {
    name: "Form Champion",
    description: "100% form completion for 3 consecutive months",
    icon: "clipboard-check",
  },
  reliability_rock: {
    name: "Reliability Rock",
    description: "100% shift completion for 3 consecutive months",
    icon: "shield-check",
  },
  multi_sport_master: {
    name: "Multi-Sport Master",
    description: "Delivered 5+ different sports",
    icon: "medal",
  },
} as const;

export type BadgeKey = keyof typeof BADGE_DEFINITIONS;

export async function checkBadgeEligibility(
  coachId: string
): Promise<BadgeKey[]> {
  const supabase = createSupabaseAdmin();
  const eligible: BadgeKey[] = [];

  // --- fifty_sessions & century_coach ---
  const { count: sessionCount, error: sessionCountError } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .eq("status", "completed");

  if (!sessionCountError) {
    const count = sessionCount ?? 0;
    if (count >= 50) eligible.push("fifty_sessions");
    if (count >= 100) eligible.push("century_coach");
  }

  // --- five_star ---
  const { data: feedbackData, error: feedbackError } = await supabase
    .from("feedback_ratings")
    .select("rating, sessions!inner(coach_id)")
    .eq("sessions.coach_id", coachId);

  if (!feedbackError && feedbackData && feedbackData.length >= 20) {
    const avg =
      feedbackData.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
      feedbackData.length;
    if (avg >= 4.8) eligible.push("five_star");
  }

  // --- perfect_punctuality ---
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const { data: punctualitySessions, error: punctualityError } = await supabase
    .from("sessions")
    .select("scheduled_start, started_at")
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .gte("scheduled_start", monthStart)
    .lte("scheduled_start", monthEnd)
    .not("started_at", "is", null);

  if (
    !punctualityError &&
    punctualitySessions &&
    punctualitySessions.length >= 5
  ) {
    const allPunctual = punctualitySessions.every((s) => {
      if (!s.started_at || !s.scheduled_start) return false;
      const diffMs =
        new Date(s.started_at).getTime() -
        new Date(s.scheduled_start).getTime();
      return diffMs <= 5 * 60 * 1000; // <= 5 minutes late
    });
    if (allPunctual) eligible.push("perfect_punctuality");
  }

  // --- form_champion ---
  // Check the last 3 complete calendar months
  const formMonths = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (i + 1), 1);
    return {
      start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
    };
  });

  let formChampion = true;
  for (const { start, end } of formMonths) {
    const { count: completedInMonth, error: completedErr } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .gte("scheduled_start", start)
      .lte("scheduled_start", end);

    if (completedErr || (completedInMonth ?? 0) === 0) {
      formChampion = false;
      break;
    }

    const expectedForms = (completedInMonth ?? 0) * 2;

    // Get session IDs for this month to scope form_submissions
    const { data: monthSessions, error: monthSessionsErr } = await supabase
      .from("sessions")
      .select("id")
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .gte("scheduled_start", start)
      .lte("scheduled_start", end);

    if (monthSessionsErr || !monthSessions || monthSessions.length === 0) {
      formChampion = false;
      break;
    }

    const sessionIds = monthSessions.map((s) => s.id);

    const { count: formCount, error: formErr } = await supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .in("session_id", sessionIds);

    if (formErr || (formCount ?? 0) < expectedForms) {
      formChampion = false;
      break;
    }
  }
  if (formChampion) eligible.push("form_champion");

  // --- reliability_rock ---
  // Check the last 3 complete calendar months — 0 cancellations + >= 5 completed sessions per month
  const reliabilityMonths = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (i + 1), 1);
    return {
      start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
    };
  });

  let reliabilityRock = true;
  for (const { start, end } of reliabilityMonths) {
    const { count: completedInMonth, error: completedErr } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .gte("scheduled_start", start)
      .lte("scheduled_start", end);

    if (completedErr || (completedInMonth ?? 0) < 5) {
      reliabilityRock = false;
      break;
    }

    // Check rerostering_events for cancellations in this month
    const { count: cancellationCount, error: cancellationErr } = await supabase
      .from("rerostering_events")
      .select("id", { count: "exact", head: true })
      .eq("original_coach_id", coachId)
      .gte("created_at", start)
      .lte("created_at", end);

    if (cancellationErr || (cancellationCount ?? 0) > 0) {
      reliabilityRock = false;
      break;
    }
  }
  if (reliabilityRock) eligible.push("reliability_rock");

  // --- multi_sport_master ---
  const { data: sportsData, error: sportsError } = await supabase
    .from("sessions")
    .select("sport")
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .not("sport", "is", null);

  if (!sportsError && sportsData) {
    const distinctSports = new Set(sportsData.map((s) => s.sport)).size;
    if (distinctSports >= 5) eligible.push("multi_sport_master");
  }

  // --- Filter out already-earned badges ---
  const { data: existingBadges, error: existingError } = await supabase
    .from("coach_badges")
    .select("badge_key")
    .eq("coach_id", coachId);

  if (existingError) {
    // If we can't read existing badges, return empty to avoid duplicate awards
    return [];
  }

  const earnedKeys = new Set((existingBadges ?? []).map((b) => b.badge_key));
  return eligible.filter((key) => !earnedKeys.has(key));
}

export async function awardBadges(
  coachId: string,
  badges: BadgeKey[]
): Promise<void> {
  if (badges.length === 0) return;

  const supabase = createSupabaseAdmin();

  for (const badge of badges) {
    // Insert badge — upsert with ignoreDuplicates to handle unique index on coach_id + badge_key
    const { error: badgeError } = await supabase
      .from("coach_badges")
      .upsert(
        {
          coach_id: coachId,
          badge_key: badge,
          earned_at: new Date().toISOString(),
          metadata: {},
        },
        { onConflict: "coach_id,badge_key", ignoreDuplicates: true }
      );

    if (badgeError) {
      console.error(`Failed to award badge ${badge} to coach ${coachId}:`, badgeError);
      continue;
    }

    // Insert notification for the newly awarded badge
    await supabase.from("notifications").insert({
      user_id: coachId,
      type: "badge_earned",
      title: `Badge Earned: ${BADGE_DEFINITIONS[badge].name}`,
      body: BADGE_DEFINITIONS[badge].description,
      tier: "informational",
      entity_type: "coach_badge",
      entity_id: coachId,
      data: { badge_key: badge },
    });
  }
}

export async function getCoachBadges(coachId: string): Promise<CoachBadge[]> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("coach_badges")
    .select("*")
    .eq("coach_id", coachId)
    .order("earned_at", { ascending: false });

  if (error) {
    console.error(`Failed to fetch badges for coach ${coachId}:`, error);
    return [];
  }

  return (data ?? []) as CoachBadge[];
}
