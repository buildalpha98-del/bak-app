"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TrainingModule,
  TrainingAssignment,
  TrainingCompletion,
} from "@/lib/types/database";

/**
 * Get a module for the completion UI, including the coach's assignment and attempt history.
 */
export async function getModuleForCompletion(moduleId: string): Promise<{
  module: TrainingModule;
  assignment: TrainingAssignment | null;
  attempts: TrainingCompletion[];
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: module } = await supabase
    .from("training_modules")
    .select("*")
    .eq("id", moduleId)
    .single();
  if (!module) return null;

  const { data: assignment } = await supabase
    .from("training_assignments")
    .select("*")
    .eq("coach_id", user.id)
    .eq("module_id", moduleId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: attempts } = await supabase
    .from("training_completions")
    .select("*")
    .eq("coach_id", user.id)
    .eq("module_id", moduleId)
    .order("completed_at", { ascending: false });

  return {
    module: module as TrainingModule,
    assignment: assignment as TrainingAssignment | null,
    attempts: (attempts as TrainingCompletion[]) ?? [],
  };
}

/**
 * Mark assignment as in_progress when coach starts a module.
 */
export async function startModuleProgress(
  assignmentId: string
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("training_assignments")
    .update({ status: "in_progress" })
    .eq("id", assignmentId)
    .eq("status", "assigned"); // only update if currently "assigned"
}

/**
 * Complete a module. Creates a training_completions record and updates assignment status.
 * Also checks pathway progression.
 */
export async function completeModule(
  assignmentId: string,
  moduleId: string,
  data: {
    score?: number;
    passed?: boolean;
    attempt_number?: number;
    completion_data?: Record<string, unknown>;
  }
): Promise<
  | { success: true; pathwayComplete?: boolean; nextModuleId?: string }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Create completion record
  const { error: compError } = await supabase
    .from("training_completions")
    .insert({
      coach_id: user.id,
      module_id: moduleId,
      assignment_id: assignmentId,
      score: data.score ?? null,
      passed: data.passed ?? true,
      attempt_number: data.attempt_number ?? 1,
      completion_data: data.completion_data ?? null,
    });

  if (compError) {
    console.error("Error creating completion:", compError);
    return { error: compError.message };
  }

  // Update assignment status to completed
  await supabase
    .from("training_assignments")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", assignmentId);

  // Check pathway progression
  // Find if this module is part of any pathway that the coach is assigned to
  const { data: pathwayModules } = await supabase
    .from("training_pathway_modules")
    .select("pathway_id, order_index")
    .eq("module_id", moduleId);

  let pathwayComplete = false;
  let nextModuleId: string | undefined;

  if (pathwayModules && pathwayModules.length > 0) {
    for (const pm of pathwayModules) {
      // Check if coach has a pathway assignment
      const { data: pathwayAssignment } = await supabase
        .from("training_assignments")
        .select("id")
        .eq("coach_id", user.id)
        .eq("pathway_id", pm.pathway_id)
        .neq("status", "completed")
        .maybeSingle();

      if (!pathwayAssignment) continue;

      // Get all modules in this pathway
      const { data: allPathwayModules } = await supabase
        .from("training_pathway_modules")
        .select("module_id, order_index")
        .eq("pathway_id", pm.pathway_id)
        .order("order_index", { ascending: true });

      if (!allPathwayModules) continue;

      // Check which modules the coach has completed
      const moduleIds = allPathwayModules.map((m) => m.module_id);
      const { data: completions } = await supabase
        .from("training_completions")
        .select("module_id")
        .eq("coach_id", user.id)
        .in("module_id", moduleIds);

      const completedModuleIds = new Set(
        (completions ?? []).map((c) => c.module_id)
      );
      // Add the just-completed module
      completedModuleIds.add(moduleId);

      if (completedModuleIds.size >= allPathwayModules.length) {
        // All modules complete — mark pathway assignment as completed
        pathwayComplete = true;
        await supabase
          .from("training_assignments")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", pathwayAssignment.id);

        // Send congratulations notification
        const { data: pathway } = await supabase
          .from("training_pathways")
          .select("title")
          .eq("id", pm.pathway_id)
          .single();

        if (pathway) {
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "training_completed",
            title: "Pathway completed!",
            body: `Congratulations — you've completed ${pathway.title}!`,
            tier: "informational",
          });
        }
      } else {
        // Find next uncompleted module in order
        for (const m of allPathwayModules) {
          if (!completedModuleIds.has(m.module_id)) {
            nextModuleId = m.module_id;
            break;
          }
        }
      }
    }
  }

  // Log completion
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_completed",
    entity_type: "training_module",
    entity_id: moduleId,
  });

  revalidatePath("/coach/training");
  return { success: true, pathwayComplete, nextModuleId };
}
