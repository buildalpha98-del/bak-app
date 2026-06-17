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

/**
 * Soft-delete a training pathway by archiving it.
 * Sets status to 'archived' rather than deleting the record.
 */
export async function deleteTrainingPathway(
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
    .from("training_pathways")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Error archiving training pathway:", error);
    return { error: error.message };
  }

  // Log archival to activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "training_pathway_archived",
    entity_type: "training_pathway",
    entity_id: id,
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

// ============================================================
// Auth gate — admin/ops only for bulk + destructive operations
// ============================================================

async function requireAdminOrOps(): Promise<
  | { ok: true; userId: string; role: "admin" | "ops" }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { ok: false, error: "Not authorised." };
  }

  return { ok: true, userId: user.id, role: profile.role };
}

// ============================================================
// bulkPublishTrainingModules
// ============================================================
//
// Flips each selected draft/archived module to `published`. Bulk
// "publish all the in-flight modules now that I've reviewed them"
// flow. Per-id errors don't sink the whole batch.

export async function bulkPublishTrainingModules(
  moduleIds: string[],
): Promise<{
  published: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!moduleIds.length) {
    return { published: 0, errors: [], error: "No modules selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { published: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const errors: { id: string; error: string }[] = [];
  let published = 0;

  for (const id of moduleIds) {
    const { error } = await supabase
      .from("training_modules")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
    } else {
      published += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "training_module_bulk_published",
        entity_type: "training_module",
        entity_id: id,
      });
    }
  }

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return {
    published,
    errors,
    error:
      errors.length && published === 0
        ? "Failed to publish modules."
        : errors.length
          ? "Some modules failed to publish."
          : null,
  };
}

// ============================================================
// bulkArchiveTrainingModules
// ============================================================
//
// Soft-archives each selected module by flipping status. Existing
// assignments and completions are preserved by design — archival
// only hides from the library, never wipes audit history.

export async function bulkArchiveTrainingModules(
  moduleIds: string[],
): Promise<{
  archived: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!moduleIds.length) {
    return { archived: 0, errors: [], error: "No modules selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { archived: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const errors: { id: string; error: string }[] = [];
  let archived = 0;

  for (const id of moduleIds) {
    const { error } = await supabase
      .from("training_modules")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
    } else {
      archived += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "training_module_bulk_archived",
        entity_type: "training_module",
        entity_id: id,
      });
    }
  }

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return {
    archived,
    errors,
    error:
      errors.length && archived === 0
        ? "Failed to archive modules."
        : errors.length
          ? "Some modules failed to archive."
          : null,
  };
}

// ============================================================
// bulkAssignTrainingModulesToAllCoaches
// ============================================================
//
// For the "Assign to coaches" bulk action. Assigns every selected
// module to every active coach, skipping any coach already holding
// an open (`assigned` / `in_progress`) assignment for that module.
// Mirrors `bulkAssignModule` in spirit but operates on N modules ×
// M coaches in one pass.

export async function bulkAssignTrainingModulesToAllCoaches(
  moduleIds: string[],
  dueDate?: string,
): Promise<{
  assignments: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!moduleIds.length) {
    return { assignments: 0, errors: [], error: "No modules selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { assignments: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  // Pull modules first — we need titles for the notification body
  // and to filter out anything that isn't published.
  const { data: modules, error: modulesError } = await supabase
    .from("training_modules")
    .select("id, title, status")
    .in("id", moduleIds);
  if (modulesError) {
    return { assignments: 0, errors: [], error: modulesError.message };
  }

  const errors: { id: string; error: string }[] = [];
  const eligible: Array<{ id: string; title: string }> = [];
  for (const m of modules ?? []) {
    const row = m as { id: string; title: string; status: string };
    if (row.status !== "published") {
      errors.push({ id: row.id, error: "Module is not published." });
    } else {
      eligible.push({ id: row.id, title: row.title });
    }
  }

  // Active coaches (one fetch — reused per module).
  const { data: coaches, error: coachesError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "coach")
    .eq("status", "active");
  if (coachesError) {
    return { assignments: 0, errors, error: coachesError.message };
  }
  const coachIds = (coaches ?? []).map((c) => (c as { id: string }).id);

  if (coachIds.length === 0 || eligible.length === 0) {
    return {
      assignments: 0,
      errors,
      error:
        eligible.length === 0
          ? "No published modules in selection."
          : "No active coaches.",
    };
  }

  // Existing open assignments for this batch (one fetch).
  const { data: existing } = await supabase
    .from("training_assignments")
    .select("coach_id, module_id")
    .in("module_id", eligible.map((m) => m.id))
    .in("status", ["assigned", "in_progress"]);
  const openPairs = new Set<string>();
  for (const row of existing ?? []) {
    const r = row as { coach_id: string; module_id: string };
    openPairs.add(`${r.coach_id}::${r.module_id}`);
  }

  // Build insert payload + notification payload.
  const inserts: Array<{
    coach_id: string;
    module_id: string;
    pathway_id: null;
    assigned_by: string;
    due_date: string | null;
    status: "assigned";
  }> = [];
  const notifications: Array<{
    user_id: string;
    type: string;
    title: string;
    body: string;
    tier: "important";
  }> = [];

  for (const m of eligible) {
    for (const coachId of coachIds) {
      if (openPairs.has(`${coachId}::${m.id}`)) continue;
      inserts.push({
        coach_id: coachId,
        module_id: m.id,
        pathway_id: null,
        assigned_by: gate.userId,
        due_date: dueDate ?? null,
        status: "assigned",
      });
      notifications.push({
        user_id: coachId,
        type: "training_assigned",
        title: "New training assigned",
        body: `New training assigned: ${m.title}`,
        tier: "important",
      });
    }
  }

  if (inserts.length === 0) {
    return { assignments: 0, errors, error: null };
  }

  const { error: insertError } = await supabase
    .from("training_assignments")
    .insert(inserts);
  if (insertError) {
    return {
      assignments: 0,
      errors,
      error: insertError.message,
    };
  }

  await supabase.from("notifications").insert(notifications);

  // One activity log row per module bulk-assigned — keeps the audit
  // navigable per-module rather than one mega row.
  for (const m of eligible) {
    await supabase.from("activity_log").insert({
      user_id: gate.userId,
      action: "training_module_bulk_assigned_all",
      entity_type: "training_module",
      entity_id: m.id,
      metadata: { coach_count: coachIds.length },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/ops/training");

  return {
    assignments: inserts.length,
    errors,
    error: errors.length ? "Some modules were skipped." : null,
  };
}

// ============================================================
// exportTrainingModulesCsv
// ============================================================
//
// Returns a CSV string of the selected modules for admin review or
// curriculum hand-off. Columns: title, type, category, mandatory,
// status, estimated minutes, required-for-sports, created.

export async function exportTrainingModulesCsv(
  moduleIds: string[],
): Promise<{ csv: string | null; error: string | null }> {
  if (!moduleIds.length) {
    return { csv: null, error: "No modules selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { csv: null, error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("training_modules")
    .select(
      "id, title, type, category, is_mandatory, status, estimated_minutes, required_for_sports, created_at",
    )
    .in("id", moduleIds);
  if (error) return { csv: null, error: error.message };

  const header = [
    "Title",
    "Type",
    "Category",
    "Mandatory",
    "Status",
    "Estimated minutes",
    "Required for sports",
    "Created",
  ];

  function escape(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const lines: string[] = [header.map(escape).join(",")];
  for (const row of rows ?? []) {
    const r = row as unknown as {
      title: string;
      type: string;
      category: string;
      is_mandatory: boolean;
      status: string;
      estimated_minutes: number | null;
      required_for_sports: string[] | null;
      created_at: string;
    };
    lines.push(
      [
        escape(r.title),
        escape(r.type),
        escape(r.category),
        escape(r.is_mandatory ? "Yes" : "No"),
        escape(r.status),
        escape(r.estimated_minutes != null ? String(r.estimated_minutes) : ""),
        escape(
          r.required_for_sports && r.required_for_sports.length > 0
            ? r.required_for_sports.join("; ")
            : "",
        ),
        escape(r.created_at.slice(0, 10)),
      ].join(","),
    );
  }

  await supabase.from("activity_log").insert({
    user_id: gate.userId,
    action: "training_modules_exported_csv",
    entity_type: "training_module",
    entity_id: moduleIds[0],
    metadata: { count: moduleIds.length },
  });

  return { csv: lines.join("\n"), error: null };
}
