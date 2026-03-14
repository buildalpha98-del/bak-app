"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TrainingModule,
  TrainingPathway,
  TrainingPathwayModule,
  TrainingAssignment,
  TrainingCompletion,
} from "@/lib/types/database";
import type {
  TrainingModuleType,
  TrainingCategory,
  TrainingStatus,
} from "@/lib/types/enums";

// ─────────────────────────────────────────────
// MODULE CRUD
// ─────────────────────────────────────────────

/**
 * List all training modules with optional filters.
 * Returns modules ordered newest first.
 */
export async function getTrainingModules(filters?: {
  type?: TrainingModuleType;
  category?: TrainingCategory;
  status?: TrainingStatus;
  mandatory?: boolean;
}): Promise<TrainingModule[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("training_modules")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.mandatory !== undefined) {
    query = query.eq("is_mandatory", filters.mandatory);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching training modules:", error);
    return [];
  }

  return (data as TrainingModule[]) ?? [];
}

/**
 * Fetch a single training module by ID, including its full content_json.
 */
export async function getTrainingModule(
  id: string
): Promise<TrainingModule | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("training_modules")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching training module:", error);
    return null;
  }

  return (data as TrainingModule) ?? null;
}

/**
 * Create a new training module in draft status.
 * Logs the creation to the activity log.
 */
export async function createTrainingModule(data: {
  title: string;
  description?: string;
  type: TrainingModuleType;
  category: TrainingCategory;
  content_json: Record<string, unknown>;
  estimated_minutes?: number;
  is_mandatory?: boolean;
  required_for_sports?: string[];
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { data: module, error } = await supabase
    .from("training_modules")
    .insert({
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      category: data.category,
      content_json: data.content_json,
      estimated_minutes: data.estimated_minutes ?? null,
      is_mandatory: data.is_mandatory ?? false,
      required_for_sports: data.required_for_sports ?? null,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating training module:", error);
    return { error: error.message };
  }

  // Log creation to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_created",
    entity_type: "training_module",
    entity_id: module.id,
  });

  revalidatePath("/admin/training");

  return { id: module.id };
}

/**
 * Update an existing training module's details.
 * Sets updated_at and logs the change to the activity log.
 */
export async function updateTrainingModule(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    category: TrainingCategory;
    content_json: Record<string, unknown>;
    estimated_minutes: number;
    is_mandatory: boolean;
    required_for_sports: string[];
  }>
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("training_modules")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating training module:", error);
    return { error: error.message };
  }

  // Log update to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_updated",
    entity_type: "training_module",
    entity_id: id,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

/**
 * Soft-delete a training module by archiving it.
 * Sets status to 'archived' rather than deleting the record.
 */
export async function deleteTrainingModule(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("training_modules")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Error archiving training module:", error);
    return { error: error.message };
  }

  // Log archival to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_archived",
    entity_type: "training_module",
    entity_id: id,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

/**
 * Publish a training module, making it visible to coaches.
 * Changes status from draft to published.
 */
export async function publishTrainingModule(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("training_modules")
    .update({
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Error publishing training module:", error);
    return { error: error.message };
  }

  // Log publication to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_module_published",
    entity_type: "training_module",
    entity_id: id,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

// ─────────────────────────────────────────────
// PATHWAY CRUD
// ─────────────────────────────────────────────

/**
 * List all training pathways with optional filters.
 * Includes a module_count for display in the UI.
 */
export async function getTrainingPathways(filters?: {
  category?: TrainingCategory;
  status?: TrainingStatus;
}): Promise<Array<TrainingPathway & { module_count: number }>> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("training_pathways")
    .select("*, training_pathway_modules(count)")
    .order("created_at", { ascending: false });

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching training pathways:", error);
    return [];
  }

  // Map Supabase aggregate count into a flat module_count field
  return (data ?? []).map((row: Record<string, unknown>) => {
    const { training_pathway_modules, ...pathway } = row as Record<
      string,
      unknown
    > & { training_pathway_modules: Array<{ count: number }> };

    const module_count =
      Array.isArray(training_pathway_modules) &&
      training_pathway_modules.length > 0
        ? (training_pathway_modules[0] as { count: number }).count
        : 0;

    return {
      ...(pathway as unknown as TrainingPathway),
      module_count,
    };
  });
}

/**
 * Fetch a single training pathway with its ordered modules and their full module data.
 */
export async function getTrainingPathway(
  id: string
): Promise<
  | (TrainingPathway & {
      modules: Array<TrainingPathwayModule & { module: TrainingModule }>;
    })
  | null
> {
  const supabase = await createSupabaseServerClient();

  const { data: pathway, error: pathwayError } = await supabase
    .from("training_pathways")
    .select("*")
    .eq("id", id)
    .single();

  if (pathwayError) {
    console.error("Error fetching training pathway:", pathwayError);
    return null;
  }

  const { data: pathwayModules, error: modulesError } = await supabase
    .from("training_pathway_modules")
    .select("*, module:training_modules(*)")
    .eq("pathway_id", id)
    .order("order_index", { ascending: true });

  if (modulesError) {
    console.error("Error fetching pathway modules:", modulesError);
    return null;
  }

  return {
    ...(pathway as TrainingPathway),
    modules:
      (pathwayModules as unknown as Array<
        TrainingPathwayModule & { module: TrainingModule }
      >) ?? [],
  };
}

/**
 * Create a new training pathway.
 * Logs the creation to the activity log.
 */
export async function createTrainingPathway(data: {
  title: string;
  description?: string;
  category: TrainingCategory;
  is_mandatory_onboarding?: boolean;
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { data: pathway, error } = await supabase
    .from("training_pathways")
    .insert({
      title: data.title,
      description: data.description ?? null,
      category: data.category,
      is_mandatory_onboarding: data.is_mandatory_onboarding ?? false,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating training pathway:", error);
    return { error: error.message };
  }

  // Log creation to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_created",
    entity_type: "training_pathway",
    entity_id: pathway.id,
  });

  revalidatePath("/admin/training");

  return { id: pathway.id };
}

/**
 * Update an existing training pathway's details.
 */
export async function updateTrainingPathway(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    category: TrainingCategory;
    is_mandatory_onboarding: boolean;
  }>
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("training_pathways")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating training pathway:", error);
    return { error: error.message };
  }

  // Log update to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_updated",
    entity_type: "training_pathway",
    entity_id: id,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

/**
 * Add a training module to a pathway at the specified order index.
 */
export async function addModuleToPathway(
  pathwayId: string,
  moduleId: string,
  orderIndex: number
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase.from("training_pathway_modules").insert({
    pathway_id: pathwayId,
    module_id: moduleId,
    order_index: orderIndex,
  });

  if (error) {
    console.error("Error adding module to pathway:", error);
    return { error: error.message };
  }

  // Log the change to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_module_added",
    entity_type: "training_pathway",
    entity_id: pathwayId,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

/**
 * Remove a module from a training pathway by the junction record ID.
 */
export async function removeModuleFromPathway(
  pathwayModuleId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Fetch the record first so we can log the pathway_id
  const { data: existing, error: fetchError } = await supabase
    .from("training_pathway_modules")
    .select("pathway_id")
    .eq("id", pathwayModuleId)
    .single();

  if (fetchError) {
    console.error("Error fetching pathway module record:", fetchError);
    return { error: fetchError.message };
  }

  const { error } = await supabase
    .from("training_pathway_modules")
    .delete()
    .eq("id", pathwayModuleId);

  if (error) {
    console.error("Error removing module from pathway:", error);
    return { error: error.message };
  }

  // Log the removal to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_module_removed",
    entity_type: "training_pathway",
    entity_id: existing.pathway_id,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

/**
 * Reorder modules within a pathway by updating each module's order_index.
 * Accepts an array of module IDs in the desired display order.
 */
export async function reorderPathwayModules(
  pathwayId: string,
  orderedModuleIds: string[]
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated." };
  }

  // Update each module's order_index sequentially
  for (let i = 0; i < orderedModuleIds.length; i++) {
    const { error } = await supabase
      .from("training_pathway_modules")
      .update({ order_index: i })
      .eq("pathway_id", pathwayId)
      .eq("module_id", orderedModuleIds[i]);

    if (error) {
      console.error(
        `Error updating order_index for module ${orderedModuleIds[i]}:`,
        error
      );
      return { error: error.message };
    }
  }

  // Log the reorder to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_modules_reordered",
    entity_type: "training_pathway",
    entity_id: pathwayId,
  });

  revalidatePath("/admin/training");

  return { success: true };
}

// ─────────────────────────────────────────────
// PATHWAY PUBLISHING
// ─────────────────────────────────────────────

/**
 * Publish a training pathway, making it available for assignment.
 */
export async function publishTrainingPathway(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("training_pathways")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Error publishing pathway:", error);
    return { error: error.message };
  }

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_published",
    entity_type: "training_pathway",
    entity_id: id,
  });

  revalidatePath("/admin/training");
  return { success: true };
}

/**
 * Lightweight fetch of published modules for the pathway "Add Module" dropdown.
 */
export async function getPublishedModulesForSearch(): Promise<
  Array<{ id: string; title: string; type: string; estimated_minutes: number | null }>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("training_modules")
    .select("id, title, type, estimated_minutes")
    .eq("status", "published")
    .order("title", { ascending: true });

  if (error) {
    console.error("Error fetching published modules:", error);
    return [];
  }
  return data ?? [];
}
