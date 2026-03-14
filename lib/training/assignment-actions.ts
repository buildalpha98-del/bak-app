"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TrainingAssignment,
  TrainingModule,
  TrainingPathway,
} from "@/lib/types/database";

// ─────────────────────────────────────────────
// ASSIGN MODULE / PATHWAY
// ─────────────────────────────────────────────

/**
 * Assign a single training module to a coach.
 */
export async function assignModuleToCoach(
  coachId: string,
  moduleId: string,
  dueDate?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Fetch module title for the notification
  const { data: module } = await supabase
    .from("training_modules")
    .select("title")
    .eq("id", moduleId)
    .single();

  if (!module) {
    return { error: "Module not found." };
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from("training_assignments")
    .select("id")
    .eq("coach_id", coachId)
    .eq("module_id", moduleId)
    .in("status", ["assigned", "in_progress"])
    .maybeSingle();

  if (existing) {
    return { error: "This module is already assigned to this coach." };
  }

  const { error } = await supabase.from("training_assignments").insert({
    coach_id: coachId,
    module_id: moduleId,
    pathway_id: null,
    assigned_by: user.id,
    due_date: dueDate ?? null,
    status: "assigned",
  });

  if (error) {
    console.error("Error assigning module to coach:", error);
    return { error: error.message };
  }

  // Send notification
  await supabase.from("notifications").insert({
    user_id: coachId,
    type: "training_assigned",
    title: "New training assigned",
    body: `New training assigned: ${module.title}`,
    tier: "important",
  });

  // Log to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_assigned",
    entity_type: "training_assignment",
    entity_id: moduleId,
    metadata: { coach_id: coachId, module_id: moduleId },
  });

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return { success: true };
}

/**
 * Assign a training pathway to a coach.
 */
export async function assignPathwayToCoach(
  coachId: string,
  pathwayId: string,
  dueDate?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Fetch pathway title for the notification
  const { data: pathway } = await supabase
    .from("training_pathways")
    .select("title")
    .eq("id", pathwayId)
    .single();

  if (!pathway) {
    return { error: "Pathway not found." };
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from("training_assignments")
    .select("id")
    .eq("coach_id", coachId)
    .eq("pathway_id", pathwayId)
    .in("status", ["assigned", "in_progress"])
    .maybeSingle();

  if (existing) {
    return { error: "This pathway is already assigned to this coach." };
  }

  const { error } = await supabase.from("training_assignments").insert({
    coach_id: coachId,
    module_id: null,
    pathway_id: pathwayId,
    assigned_by: user.id,
    due_date: dueDate ?? null,
    status: "assigned",
  });

  if (error) {
    console.error("Error assigning pathway to coach:", error);
    return { error: error.message };
  }

  // Send notification
  await supabase.from("notifications").insert({
    user_id: coachId,
    type: "training_assigned",
    title: "New training assigned",
    body: `New training assigned: ${pathway.title}`,
    tier: "important",
  });

  // Log to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_assigned",
    entity_type: "training_assignment",
    entity_id: pathwayId,
    metadata: { coach_id: coachId, pathway_id: pathwayId },
  });

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return { success: true };
}

// ─────────────────────────────────────────────
// BULK ASSIGN
// ─────────────────────────────────────────────

/**
 * Assign a module to all active coaches, skipping those already assigned.
 */
export async function bulkAssignModule(
  moduleId: string,
  dueDate?: string
): Promise<{ assigned: number } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Fetch module title
  const { data: module } = await supabase
    .from("training_modules")
    .select("title")
    .eq("id", moduleId)
    .single();

  if (!module) {
    return { error: "Module not found." };
  }

  // Get all active coaches
  const { data: coaches, error: coachError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "coach")
    .eq("status", "active");

  if (coachError) {
    console.error("Error fetching active coaches:", coachError);
    return { error: coachError.message };
  }

  if (!coaches || coaches.length === 0) {
    return { assigned: 0 };
  }

  // Get existing assignments for this module
  const { data: existingAssignments } = await supabase
    .from("training_assignments")
    .select("coach_id")
    .eq("module_id", moduleId)
    .in("status", ["assigned", "in_progress"]);

  const alreadyAssigned = new Set(
    (existingAssignments ?? []).map((a) => a.coach_id)
  );

  const coachesToAssign = coaches.filter((c) => !alreadyAssigned.has(c.id));

  if (coachesToAssign.length === 0) {
    return { assigned: 0 };
  }

  // Insert assignments
  const assignments = coachesToAssign.map((c) => ({
    coach_id: c.id,
    module_id: moduleId,
    pathway_id: null,
    assigned_by: user.id,
    due_date: dueDate ?? null,
    status: "assigned" as const,
  }));

  const { error: insertError } = await supabase
    .from("training_assignments")
    .insert(assignments);

  if (insertError) {
    console.error("Error bulk assigning module:", insertError);
    return { error: insertError.message };
  }

  // Send notifications
  const notifications = coachesToAssign.map((c) => ({
    user_id: c.id,
    type: "training_assigned",
    title: "New training assigned",
    body: `New training assigned: ${module.title}`,
    tier: "important" as const,
  }));

  await supabase.from("notifications").insert(notifications);

  // Log to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_bulk_assigned",
    entity_type: "training_module",
    entity_id: moduleId,
    metadata: { count: coachesToAssign.length },
  });

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return { assigned: coachesToAssign.length };
}

/**
 * Assign a pathway to all active coaches, skipping those already assigned.
 */
export async function bulkAssignPathway(
  pathwayId: string,
  dueDate?: string
): Promise<{ assigned: number } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Fetch pathway title
  const { data: pathway } = await supabase
    .from("training_pathways")
    .select("title")
    .eq("id", pathwayId)
    .single();

  if (!pathway) {
    return { error: "Pathway not found." };
  }

  // Get all active coaches
  const { data: coaches, error: coachError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "coach")
    .eq("status", "active");

  if (coachError) {
    console.error("Error fetching active coaches:", coachError);
    return { error: coachError.message };
  }

  if (!coaches || coaches.length === 0) {
    return { assigned: 0 };
  }

  // Get existing assignments for this pathway
  const { data: existingAssignments } = await supabase
    .from("training_assignments")
    .select("coach_id")
    .eq("pathway_id", pathwayId)
    .in("status", ["assigned", "in_progress"]);

  const alreadyAssigned = new Set(
    (existingAssignments ?? []).map((a) => a.coach_id)
  );

  const coachesToAssign = coaches.filter((c) => !alreadyAssigned.has(c.id));

  if (coachesToAssign.length === 0) {
    return { assigned: 0 };
  }

  // Insert assignments
  const assignments = coachesToAssign.map((c) => ({
    coach_id: c.id,
    module_id: null,
    pathway_id: pathwayId,
    assigned_by: user.id,
    due_date: dueDate ?? null,
    status: "assigned" as const,
  }));

  const { error: insertError } = await supabase
    .from("training_assignments")
    .insert(assignments);

  if (insertError) {
    console.error("Error bulk assigning pathway:", insertError);
    return { error: insertError.message };
  }

  // Send notifications
  const notifications = coachesToAssign.map((c) => ({
    user_id: c.id,
    type: "training_assigned",
    title: "New training assigned",
    body: `New training assigned: ${pathway.title}`,
    tier: "important" as const,
  }));

  await supabase.from("notifications").insert(notifications);

  // Log to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_bulk_assigned",
    entity_type: "training_pathway",
    entity_id: pathwayId,
    metadata: { count: coachesToAssign.length },
  });

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return { assigned: coachesToAssign.length };
}

// ─────────────────────────────────────────────
// QUERY ASSIGNMENTS
// ─────────────────────────────────────────────

type AssignmentWithDetails = TrainingAssignment & {
  module?: TrainingModule;
  pathway?: TrainingPathway;
};

/**
 * Get all training assignments for a specific coach, grouped by status.
 */
export async function getCoachAssignments(coachId: string): Promise<{
  assigned: AssignmentWithDetails[];
  in_progress: AssignmentWithDetails[];
  completed: AssignmentWithDetails[];
  overdue: AssignmentWithDetails[];
}> {
  const supabase = await createSupabaseServerClient();

  const { data: assignments, error } = await supabase
    .from("training_assignments")
    .select(
      "*, module:training_modules(*), pathway:training_pathways(*)"
    )
    .eq("coach_id", coachId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("Error fetching coach assignments:", error);
    return { assigned: [], in_progress: [], completed: [], overdue: [] };
  }

  const result: {
    assigned: AssignmentWithDetails[];
    in_progress: AssignmentWithDetails[];
    completed: AssignmentWithDetails[];
    overdue: AssignmentWithDetails[];
  } = {
    assigned: [],
    in_progress: [],
    completed: [],
    overdue: [],
  };

  for (const row of assignments ?? []) {
    const assignment = row as unknown as AssignmentWithDetails;
    const status = assignment.status;

    if (status === "assigned") {
      result.assigned.push(assignment);
    } else if (status === "in_progress") {
      result.in_progress.push(assignment);
    } else if (status === "completed") {
      result.completed.push(assignment);
    } else if (status === "overdue") {
      result.overdue.push(assignment);
    }
  }

  return result;
}

/**
 * Get all coaches assigned to a specific module with their status.
 */
export async function getModuleAssignees(
  moduleId: string
): Promise<
  Array<{
    assignment: TrainingAssignment;
    coach: { id: string; name: string };
  }>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("training_assignments")
    .select("*, coach:profiles!training_assignments_coach_id_fkey(id, name)")
    .eq("module_id", moduleId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("Error fetching module assignees:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const { coach, ...assignment } = row as Record<string, unknown> & {
      coach: { id: string; name: string };
    };
    return {
      assignment: assignment as unknown as TrainingAssignment,
      coach,
    };
  });
}

/**
 * Get all coaches assigned to a specific pathway with their status.
 */
export async function getPathwayAssignees(
  pathwayId: string
): Promise<
  Array<{
    assignment: TrainingAssignment;
    coach: { id: string; name: string };
  }>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("training_assignments")
    .select("*, coach:profiles!training_assignments_coach_id_fkey(id, name)")
    .eq("pathway_id", pathwayId)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("Error fetching pathway assignees:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const { coach, ...assignment } = row as Record<string, unknown> & {
      coach: { id: string; name: string };
    };
    return {
      assignment: assignment as unknown as TrainingAssignment,
      coach,
    };
  });
}

// ─────────────────────────────────────────────
// AUTO-ASSIGN ONBOARDING
// ─────────────────────────────────────────────

/**
 * Auto-assign all mandatory modules and mandatory_onboarding pathways
 * to a newly onboarded coach.
 */
export async function autoAssignOnboarding(coachId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assignedBy = user?.id ?? null;

  // Fetch all mandatory modules (published)
  const { data: mandatoryModules } = await supabase
    .from("training_modules")
    .select("id, title")
    .eq("is_mandatory", true)
    .eq("status", "published");

  // Fetch all mandatory onboarding pathways (published)
  const { data: mandatoryPathways } = await supabase
    .from("training_pathways")
    .select("id, title")
    .eq("is_mandatory_onboarding", true)
    .eq("status", "published");

  const assignments: Array<{
    coach_id: string;
    module_id: string | null;
    pathway_id: string | null;
    assigned_by: string | null;
    due_date: null;
    status: "assigned";
  }> = [];

  const notifications: Array<{
    user_id: string;
    type: string;
    title: string;
    body: string;
    tier: "important";
  }> = [];

  for (const mod of mandatoryModules ?? []) {
    assignments.push({
      coach_id: coachId,
      module_id: mod.id,
      pathway_id: null,
      assigned_by: assignedBy,
      due_date: null,
      status: "assigned",
    });
    notifications.push({
      user_id: coachId,
      type: "training_assigned",
      title: "New training assigned",
      body: `New training assigned: ${mod.title}`,
      tier: "important",
    });
  }

  for (const pw of mandatoryPathways ?? []) {
    assignments.push({
      coach_id: coachId,
      module_id: null,
      pathway_id: pw.id,
      assigned_by: assignedBy,
      due_date: null,
      status: "assigned",
    });
    notifications.push({
      user_id: coachId,
      type: "training_assigned",
      title: "New training assigned",
      body: `New training assigned: ${pw.title}`,
      tier: "important",
    });
  }

  if (assignments.length > 0) {
    await supabase.from("training_assignments").insert(assignments);
    await supabase.from("notifications").insert(notifications);

    // Log to activity log
    await supabase.from("activity_log").insert({
      user_id: assignedBy,
      action: "training_onboarding_auto_assigned",
      entity_type: "training_assignment",
      entity_id: coachId,
      metadata: {
        modules_count: (mandatoryModules ?? []).length,
        pathways_count: (mandatoryPathways ?? []).length,
      },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");
}

// ─────────────────────────────────────────────
// DROPDOWNS
// ─────────────────────────────────────────────

/**
 * Get list of active coaches for assignment dropdowns.
 */
export async function getActiveCoaches(): Promise<
  Array<{ id: string; name: string }>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "coach")
    .eq("status", "active")
    .order("name");

  if (error) {
    console.error("Error fetching active coaches:", error);
    return [];
  }

  return (data ?? []) as Array<{ id: string; name: string }>;
}

/**
 * Get published modules for assignment dropdowns.
 */
export async function getPublishedModulesForAssignment(): Promise<
  Array<{ id: string; title: string; type: string }>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("training_modules")
    .select("id, title, type")
    .eq("status", "published")
    .order("title");

  if (error) {
    console.error("Error fetching published modules:", error);
    return [];
  }

  return (data ?? []) as Array<{ id: string; title: string; type: string }>;
}

/**
 * Get published pathways for assignment dropdowns.
 */
export async function getPublishedPathwaysForAssignment(): Promise<
  Array<{ id: string; title: string; category: string }>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("training_pathways")
    .select("id, title, category")
    .eq("status", "published")
    .order("title");

  if (error) {
    console.error("Error fetching published pathways:", error);
    return [];
  }

  return (data ?? []) as Array<{
    id: string;
    title: string;
    category: string;
  }>;
}
