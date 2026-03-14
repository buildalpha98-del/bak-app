"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  TrainingAssignment,
  TrainingModule,
  TrainingPathway,
  TrainingCompletion,
} from "@/lib/types/database";

// ─────────────────────────────────────────────
// COACH TRAINING DASHBOARD
// ─────────────────────────────────────────────

type DashboardAssignment = TrainingAssignment & {
  module?: TrainingModule;
  pathway?: TrainingPathway;
  pathway_progress?: { completed: number; total: number };
};

type CompletedAssignment = TrainingAssignment & {
  module?: TrainingModule;
  pathway?: TrainingPathway;
  completion?: TrainingCompletion;
};

/**
 * Get the current coach's training dashboard data.
 * Returns assignments grouped by status with module/pathway details.
 */
export async function getMyTrainingDashboard(): Promise<{
  assigned: DashboardAssignment[];
  in_progress: DashboardAssignment[];
  completed: CompletedAssignment[];
}> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { assigned: [], in_progress: [], completed: [] };
  }

  // Fetch all assignments for this coach with module and pathway details
  const { data: assignments, error } = await supabase
    .from("training_assignments")
    .select("*, module:training_modules(*), pathway:training_pathways(*)")
    .eq("coach_id", user.id)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("Error fetching coach training dashboard:", error);
    return { assigned: [], in_progress: [], completed: [] };
  }

  // Fetch completions for this coach
  const { data: completions } = await supabase
    .from("training_completions")
    .select("*")
    .eq("coach_id", user.id);

  const completionsByAssignment = new Map<string, TrainingCompletion>();
  const completionsByModule = new Map<string, TrainingCompletion>();

  for (const c of (completions ?? []) as TrainingCompletion[]) {
    if (c.assignment_id) {
      completionsByAssignment.set(c.assignment_id, c);
    }
    completionsByModule.set(c.module_id, c);
  }

  // Fetch pathway progress for pathway assignments
  // Get all pathway module counts
  const pathwayIds = (assignments ?? [])
    .filter((a: Record<string, unknown>) => a.pathway_id)
    .map((a: Record<string, unknown>) => a.pathway_id as string);

  const uniquePathwayIds = [...new Set(pathwayIds)];

  const pathwayProgressMap = new Map<
    string,
    { completed: number; total: number }
  >();

  for (const pId of uniquePathwayIds) {
    // Get total modules in pathway
    const { data: pathwayModules } = await supabase
      .from("training_pathway_modules")
      .select("module_id")
      .eq("pathway_id", pId);

    const totalModules = (pathwayModules ?? []).length;
    const moduleIds = (pathwayModules ?? []).map(
      (pm: { module_id: string }) => pm.module_id
    );

    // Count completed modules from this coach's completions
    let completedCount = 0;
    for (const mId of moduleIds) {
      if (completionsByModule.has(mId)) {
        completedCount++;
      }
    }

    pathwayProgressMap.set(pId, {
      completed: completedCount,
      total: totalModules,
    });
  }

  const result: {
    assigned: DashboardAssignment[];
    in_progress: DashboardAssignment[];
    completed: CompletedAssignment[];
  } = {
    assigned: [],
    in_progress: [],
    completed: [],
  };

  for (const row of assignments ?? []) {
    const assignment = row as unknown as DashboardAssignment;

    // Attach pathway progress if it's a pathway assignment
    if (assignment.pathway_id && pathwayProgressMap.has(assignment.pathway_id)) {
      assignment.pathway_progress = pathwayProgressMap.get(
        assignment.pathway_id
      );
    }

    if (assignment.status === "assigned") {
      result.assigned.push(assignment);
    } else if (assignment.status === "in_progress") {
      result.in_progress.push(assignment);
    } else if (
      assignment.status === "completed" ||
      assignment.status === "overdue"
    ) {
      const completedAssignment = assignment as CompletedAssignment;
      // Attach completion data
      const completion =
        completionsByAssignment.get(assignment.id) ??
        (assignment.module_id
          ? completionsByModule.get(assignment.module_id)
          : undefined);
      if (completion) {
        completedAssignment.completion = completion;
      }
      result.completed.push(completedAssignment);
    }
  }

  return result;
}
