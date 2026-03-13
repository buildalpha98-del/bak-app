"use server";

import { createSupabaseServer } from "@/lib/supabase/server";
import type { TaskColumn } from "@/lib/types/database";

// ============================================================
// Column management actions (admin only)
// ============================================================

export async function createColumn(
  name: string
): Promise<{ data: TaskColumn | null; error: string | null }> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Check admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { data: null, error: "Only admins can manage columns" };
  }

  // Get current max non-final position
  const { data: columns } = await supabase
    .from("task_columns")
    .select("id, position, is_final")
    .order("position", { ascending: false });

  if (!columns) return { data: null, error: "Failed to fetch columns" };

  const finalCol = columns.find((c) => c.is_final);
  const maxNonFinalPos = columns
    .filter((c) => !c.is_final)
    .reduce((max, c) => Math.max(max, c.position), -1);

  const newPosition = maxNonFinalPos + 1;

  // Shift final column up if needed
  if (finalCol && finalCol.position <= newPosition) {
    await supabase
      .from("task_columns")
      .update({ position: newPosition + 1 })
      .eq("id", finalCol.id);
  }

  const { data, error } = await supabase
    .from("task_columns")
    .insert({ name, position: newPosition })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "column_created",
    entity_type: "task_column",
    entity_id: data.id,
    metadata: { name },
  });

  return { data, error: null };
}

export async function renameColumn(
  columnId: string,
  name: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Only admins can manage columns" };
  }

  const { error } = await supabase
    .from("task_columns")
    .update({ name })
    .eq("id", columnId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function reorderColumns(
  orderedColumnIds: string[]
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Only admins can manage columns" };
  }

  // Validate is_final column is last
  const { data: finalCol } = await supabase
    .from("task_columns")
    .select("id")
    .eq("is_final", true)
    .single();

  if (
    finalCol &&
    orderedColumnIds[orderedColumnIds.length - 1] !== finalCol.id
  ) {
    return { error: "The final (Done) column must remain last" };
  }

  // Update positions
  for (let i = 0; i < orderedColumnIds.length; i++) {
    const { error } = await supabase
      .from("task_columns")
      .update({ position: i })
      .eq("id", orderedColumnIds[i]);

    if (error) return { error: error.message };
  }

  return { error: null };
}

export async function deleteColumn(
  columnId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Only admins can manage columns" };
  }

  // Check if column is final
  const { data: column } = await supabase
    .from("task_columns")
    .select("id, is_final, name")
    .eq("id", columnId)
    .single();

  if (!column) return { error: "Column not found" };
  if (column.is_final) return { error: "Cannot delete the final (Done) column" };

  // Check if this is the last non-final column
  const { data: nonFinalCols } = await supabase
    .from("task_columns")
    .select("id")
    .eq("is_final", false);

  if (!nonFinalCols || nonFinalCols.length <= 1) {
    return { error: "Cannot delete the last non-final column" };
  }

  // Find reassignment target (lowest position, not this column, not final)
  const { data: targetCol } = await supabase
    .from("task_columns")
    .select("id")
    .eq("is_final", false)
    .neq("id", columnId)
    .order("position", { ascending: true })
    .limit(1)
    .single();

  if (!targetCol) return { error: "No column available for task reassignment" };

  // Reassign tasks
  await supabase
    .from("tasks")
    .update({ column_id: targetCol.id })
    .eq("column_id", columnId);

  // Delete column
  const { error } = await supabase
    .from("task_columns")
    .delete()
    .eq("id", columnId);

  if (error) return { error: error.message };

  // Re-compact positions
  const { data: remainingCols } = await supabase
    .from("task_columns")
    .select("id")
    .order("position", { ascending: true });

  if (remainingCols) {
    for (let i = 0; i < remainingCols.length; i++) {
      await supabase
        .from("task_columns")
        .update({ position: i })
        .eq("id", remainingCols[i].id);
    }
  }

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "column_deleted",
    entity_type: "task_column",
    entity_id: columnId,
    metadata: { name: column.name },
  });

  return { error: null };
}
