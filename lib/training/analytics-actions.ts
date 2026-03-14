"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TrainingModuleType } from "@/lib/types/enums";

// ─────────────────────────────────────────────
// RETURN TYPES
// ─────────────────────────────────────────────

export interface CompletionByType {
  type: TrainingModuleType;
  total: number;
  completed: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string; // YYYY-MM
  label: string; // e.g. "Mar 2026"
  completions: number;
}

export interface TrainingAnalytics {
  totalModules: number;
  totalAssignments: number;
  completionRate: number;
  averageQuizScore: number | null;
  overdueCount: number;
  completionByType: CompletionByType[];
  monthlyTrend: MonthlyTrend[];
}

export interface LeaderboardEntry {
  coachId: string;
  coachName: string;
  totalAssigned: number;
  completed: number;
  completionPercentage: number;
  averageQuizScore: number | null;
}

export interface ModuleStats {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  averageCompletionDays: number | null;
  averageQuizScore: number | null;
}

// ─────────────────────────────────────────────
// AGGREGATE ANALYTICS
// ─────────────────────────────────────────────

/**
 * Fetch aggregate training analytics across the platform.
 */
export async function getTrainingAnalytics(): Promise<TrainingAnalytics> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      totalModules: 0,
      totalAssignments: 0,
      completionRate: 0,
      averageQuizScore: null,
      overdueCount: 0,
      completionByType: [],
      monthlyTrend: [],
    };
  }

  // Fetch all modules count
  const { count: totalModules } = await supabase
    .from("training_modules")
    .select("*", { count: "exact", head: true })
    .neq("status", "archived");

  // Fetch all assignments
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("id, status, module_id, completed_at");

  const allAssignments = assignments ?? [];
  const totalAssignments = allAssignments.length;
  const completedAssignments = allAssignments.filter(
    (a) => a.status === "completed"
  );
  const overdueAssignments = allAssignments.filter(
    (a) => a.status === "overdue"
  );

  const completionRate =
    totalAssignments > 0
      ? Math.round((completedAssignments.length / totalAssignments) * 100)
      : 0;

  // Average quiz score from completions
  const { data: completions } = await supabase
    .from("training_completions")
    .select("score")
    .not("score", "is", null);

  let averageQuizScore: number | null = null;
  if (completions && completions.length > 0) {
    const scores = completions
      .map((c) => c.score)
      .filter((s): s is number => s !== null);
    if (scores.length > 0) {
      averageQuizScore = Math.round(
        scores.reduce((sum, s) => sum + s, 0) / scores.length
      );
    }
  }

  // Completion by module type
  const moduleTypes: TrainingModuleType[] = [
    "video",
    "document",
    "quiz",
    "checklist",
  ];

  // Fetch assignments with module type info
  const { data: assignmentsWithModules } = await supabase
    .from("training_assignments")
    .select("status, module:training_modules(type)")
    .not("module_id", "is", null);

  const completionByType: CompletionByType[] = moduleTypes.map((type) => {
    const ofType = (assignmentsWithModules ?? []).filter(
      (a) => {
        const mod = a.module as unknown as { type: string } | null;
        return mod?.type === type;
      }
    );
    const completedOfType = ofType.filter((a) => a.status === "completed");
    return {
      type,
      total: ofType.length,
      completed: completedOfType.length,
      percentage:
        ofType.length > 0
          ? Math.round((completedOfType.length / ofType.length) * 100)
          : 0,
    };
  });

  // Monthly completion trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: recentCompletions } = await supabase
    .from("training_assignments")
    .select("completed_at")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .gte("completed_at", sixMonthsAgo.toISOString());

  const monthCounts: Record<string, number> = {};
  for (const c of recentCompletions ?? []) {
    if (!c.completed_at) continue;
    const date = new Date(c.completed_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  }

  // Build trend array for last 6 months
  const monthlyTrend: MonthlyTrend[] = [];
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrend.push({
      month: key,
      label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      completions: monthCounts[key] ?? 0,
    });
  }

  return {
    totalModules: totalModules ?? 0,
    totalAssignments,
    completionRate,
    averageQuizScore,
    overdueCount: overdueAssignments.length,
    completionByType,
    monthlyTrend,
  };
}

// ─────────────────────────────────────────────
// COACH LEADERBOARD
// ─────────────────────────────────────────────

/**
 * Return coaches ranked by training completion rate.
 */
export async function getCoachTrainingLeaderboard(): Promise<
  LeaderboardEntry[]
> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return [];

  // Fetch all assignments with coach profile
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select(
      "coach_id, status, coach:profiles!training_assignments_coach_id_fkey(id, name)"
    );

  if (!assignments || assignments.length === 0) return [];

  // Group by coach
  const coachMap = new Map<
    string,
    { name: string; total: number; completed: number }
  >();

  for (const a of assignments) {
    const coach = a.coach as unknown as { id: string; name: string } | null;
    if (!coach) continue;

    const existing = coachMap.get(coach.id) ?? {
      name: coach.name,
      total: 0,
      completed: 0,
    };
    existing.total += 1;
    if (a.status === "completed") existing.completed += 1;
    coachMap.set(coach.id, existing);
  }

  // Fetch quiz scores per coach
  const { data: completions } = await supabase
    .from("training_completions")
    .select("coach_id, score")
    .not("score", "is", null);

  const coachScores = new Map<string, number[]>();
  for (const c of completions ?? []) {
    if (c.score === null) continue;
    const scores = coachScores.get(c.coach_id) ?? [];
    scores.push(c.score);
    coachScores.set(c.coach_id, scores);
  }

  // Build leaderboard
  const leaderboard: LeaderboardEntry[] = [];

  for (const [coachId, data] of coachMap) {
    const scores = coachScores.get(coachId);
    const averageQuizScore =
      scores && scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : null;

    leaderboard.push({
      coachId,
      coachName: data.name,
      totalAssigned: data.total,
      completed: data.completed,
      completionPercentage:
        data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      averageQuizScore,
    });
  }

  // Sort by completion percentage descending
  leaderboard.sort((a, b) => b.completionPercentage - a.completionPercentage);

  return leaderboard;
}

// ─────────────────────────────────────────────
// PER-MODULE STATS
// ─────────────────────────────────────────────

/**
 * Return detailed stats for a specific training module.
 */
export async function getModuleCompletionStats(
  moduleId: string
): Promise<ModuleStats> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      totalAssigned: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      averageCompletionDays: null,
      averageQuizScore: null,
    };
  }

  // Fetch all assignments for this module
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("id, status, assigned_at, completed_at")
    .eq("module_id", moduleId);

  const all = assignments ?? [];

  const completed = all.filter((a) => a.status === "completed");
  const inProgress = all.filter((a) => a.status === "in_progress");
  const notStarted = all.filter((a) => a.status === "assigned");

  // Average completion time in days
  let averageCompletionDays: number | null = null;
  const completionDays = completed
    .filter((a) => a.completed_at && a.assigned_at)
    .map((a) => {
      const assigned = new Date(a.assigned_at).getTime();
      const done = new Date(a.completed_at!).getTime();
      return (done - assigned) / (1000 * 60 * 60 * 24);
    });

  if (completionDays.length > 0) {
    averageCompletionDays = Math.round(
      (completionDays.reduce((sum, d) => sum + d, 0) / completionDays.length) *
        10
    ) / 10;
  }

  // Average quiz score for this module
  const { data: completions } = await supabase
    .from("training_completions")
    .select("score")
    .eq("module_id", moduleId)
    .not("score", "is", null);

  let averageQuizScore: number | null = null;
  const scores = (completions ?? [])
    .map((c) => c.score)
    .filter((s): s is number => s !== null);
  if (scores.length > 0) {
    averageQuizScore = Math.round(
      scores.reduce((sum, s) => sum + s, 0) / scores.length
    );
  }

  return {
    totalAssigned: all.length,
    completed: completed.length,
    inProgress: inProgress.length,
    notStarted: notStarted.length,
    averageCompletionDays,
    averageQuizScore,
  };
}
