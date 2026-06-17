"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";
import type {
  Task,
  TaskColumn,
  TaskActivity,
  TaskWithRelations,
  TaskDetail,
} from "@/lib/types/database";
import type { TaskPriority } from "@/lib/types/enums";

// ============================================================
// Task CRUD actions
// ============================================================

interface TaskFilters {
  assigneeId?: string;
  priority?: TaskPriority;
  columnId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  linkedEntityType?: string;
  source?: string;
  overdueOnly?: boolean;
  myTasksOnly?: boolean;
}

export async function getTaskColumns(): Promise<{
  data: TaskColumn[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_columns")
    .select("*")
    .order("position", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getTasks(
  filters?: TaskFilters
): Promise<{ data: TaskWithRelations[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  let query = supabase
    .from("tasks")
    .select(
      `
      *,
      column:task_columns!column_id (name, is_final),
      assignee:profiles!assignee_id (id, name, photo_url),
      creator:profiles!created_by (id, name)
    `
    )
    .order("column_order", { ascending: true });

  if (filters?.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
  if (filters?.priority) query = query.eq("priority", filters.priority);
  if (filters?.columnId) query = query.eq("column_id", filters.columnId);
  if (filters?.dueDateFrom) query = query.gte("due_date", filters.dueDateFrom);
  if (filters?.dueDateTo) query = query.lte("due_date", filters.dueDateTo);
  if (filters?.linkedEntityType)
    query = query.eq("linked_entity_type", filters.linkedEntityType);
  if (filters?.source) query = query.eq("source", filters.source);
  if (filters?.myTasksOnly) query = query.eq("assignee_id", user.id);
  if (filters?.overdueOnly) {
    const today = new Date().toISOString().split("T")[0];
    query = query.lt("due_date", today);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  // Enrich linked entity names via post-fetch batched queries
  const enriched = await enrichLinkedEntityNames(supabase, data as TaskWithRelations[]);

  return { data: enriched, error: null };
}

async function enrichLinkedEntityNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tasks: TaskWithRelations[]
): Promise<TaskWithRelations[]> {
  const entityGroups: Record<string, string[]> = {};

  for (const task of tasks) {
    if (task.linked_entity_type && task.linked_entity_id) {
      if (!entityGroups[task.linked_entity_type]) {
        entityGroups[task.linked_entity_type] = [];
      }
      entityGroups[task.linked_entity_type].push(task.linked_entity_id);
    }
  }

  const nameMap: Record<string, string> = {};

  for (const [type, ids] of Object.entries(entityGroups)) {
    const uniqueIds = [...new Set(ids)];
    let tableName: string;
    let nameField: string;

    switch (type) {
      case "centre":
        tableName = "centres";
        nameField = "name";
        break;
      case "session":
        tableName = "sessions";
        nameField = "sport";
        break;
      case "equipment_kit":
        tableName = "equipment_kits";
        nameField = "name";
        break;
      case "profile":
        tableName = "profiles";
        nameField = "name";
        break;
      case "coach_invoice":
        tableName = "coach_invoices";
        nameField = "invoice_number";
        break;
      default:
        continue;
    }

    const { data } = await supabase
      .from(tableName)
      .select(`id, ${nameField}`)
      .in("id", uniqueIds);

    if (data) {
      for (const row of data as unknown as Record<string, string>[]) {
        nameMap[row.id] = row[nameField] ?? row.id;
      }
    }
  }

  return tasks.map((task) => ({
    ...task,
    linked_entity_name:
      task.linked_entity_id ? nameMap[task.linked_entity_id] ?? null : null,
  }));
}

export async function getTaskDetail(
  taskId: string
): Promise<{ data: TaskDetail | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select(
      `
      *,
      column:task_columns!column_id (name, is_final),
      assignee:profiles!assignee_id (id, name, photo_url),
      creator:profiles!created_by (id, name)
    `
    )
    .eq("id", taskId)
    .single();

  if (taskError) return { data: null, error: taskError.message };

  const { data: activities } = await supabase
    .from("task_activity")
    .select(
      `
      *,
      user:profiles!user_id (name, photo_url)
    `
    )
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  // Enrich linked entity name
  const enriched = await enrichLinkedEntityNames(supabase, [
    task as TaskWithRelations,
  ]);

  const detail: TaskDetail = {
    ...enriched[0],
    activities: (activities ?? []) as TaskDetail["activities"],
  };

  return { data: detail, error: null };
}

interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeId?: string;
  priority: TaskPriority;
  dueDate?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  columnId?: string;
}

export async function createTask(
  input: CreateTaskInput
): Promise<{ data: Task | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Get target column (default to first by position)
  let columnId = input.columnId;
  if (!columnId) {
    const { data: cols } = await supabase
      .from("task_columns")
      .select("id")
      .eq("is_final", false)
      .order("position", { ascending: true })
      .limit(1)
      .single();
    columnId = cols?.id;
  }
  if (!columnId) return { data: null, error: "No columns available" };

  // Get max column_order in target column
  const { data: maxOrder } = await supabase
    .from("tasks")
    .select("column_order")
    .eq("column_id", columnId)
    .order("column_order", { ascending: false })
    .limit(1)
    .single();

  const newOrder = (maxOrder?.column_order ?? -1) + 1;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description ?? null,
      assignee_id: input.assigneeId ?? null,
      priority: input.priority,
      due_date: input.dueDate ?? null,
      linked_entity_type: input.linkedEntityType ?? null,
      linked_entity_id: input.linkedEntityId ?? null,
      column_id: columnId,
      column_order: newOrder,
      source: "manual",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Insert created activity
  await supabase.from("task_activity").insert({
    task_id: task.id,
    user_id: user.id,
    type: "created",
    content: `Task created: ${input.title}`,
  });

  // Send notification if assigned
  if (input.assigneeId && input.assigneeId !== user.id) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", input.assigneeId)
      .single();

    if (assignee) {
      await triggerNotification(
        {
          type: "task_assigned",
          title: "Task assigned to you",
          body: input.title,
          entityType: "task",
          entityId: task.id,
        },
        [
          {
            userId: assignee.id,
            email: assignee.email,
            name: assignee.name,
            role: assignee.role,
          },
        ]
      );
    }
  }

  // Activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "task_created",
    entity_type: "task",
    entity_id: task.id,
    metadata: { title: input.title, priority: input.priority },
  });

  return { data: task, error: null };
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  assigneeId?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
}

export async function updateTask(
  taskId: string,
  changes: UpdateTaskInput
): Promise<{ data: Task | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Get current task for change tracking
  const { data: current } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (!current) return { data: null, error: "Task not found" };

  const updatePayload: Record<string, unknown> = {};
  if (changes.title !== undefined) updatePayload.title = changes.title;
  if (changes.description !== undefined)
    updatePayload.description = changes.description;
  if (changes.assigneeId !== undefined)
    updatePayload.assignee_id = changes.assigneeId;
  if (changes.priority !== undefined) updatePayload.priority = changes.priority;
  if (changes.dueDate !== undefined) updatePayload.due_date = changes.dueDate;
  if (changes.linkedEntityType !== undefined)
    updatePayload.linked_entity_type = changes.linkedEntityType;
  if (changes.linkedEntityId !== undefined)
    updatePayload.linked_entity_id = changes.linkedEntityId;

  const { data: task, error } = await supabase
    .from("tasks")
    .update(updatePayload)
    .eq("id", taskId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Track assignment change
  if (
    changes.assigneeId !== undefined &&
    changes.assigneeId !== current.assignee_id
  ) {
    await supabase.from("task_activity").insert({
      task_id: taskId,
      user_id: user.id,
      type: "assignment_change",
      content: "Assignee changed",
      metadata: { from: current.assignee_id, to: changes.assigneeId },
    });

    // Notify new assignee
    if (changes.assigneeId && changes.assigneeId !== user.id) {
      const { data: assignee } = await supabase
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", changes.assigneeId)
        .single();

      if (assignee) {
        await triggerNotification(
          {
            type: "task_assigned",
            title: "Task assigned to you",
            body: current.title,
            entityType: "task",
            entityId: taskId,
          },
          [
            {
              userId: assignee.id,
              email: assignee.email,
              name: assignee.name,
              role: assignee.role,
            },
          ]
        );
      }
    }
  }

  // Track priority change
  if (
    changes.priority !== undefined &&
    changes.priority !== current.priority
  ) {
    await supabase.from("task_activity").insert({
      task_id: taskId,
      user_id: user.id,
      type: "priority_change",
      content: `Priority changed from ${current.priority} to ${changes.priority}`,
      metadata: { from: current.priority, to: changes.priority },
    });
  }

  // Activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "task_updated",
    entity_type: "task",
    entity_id: taskId,
    metadata: changes,
  });

  return { data: task, error: null };
}

export async function moveTask(
  taskId: string,
  columnId: string,
  newOrder: number
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get current task
  const { data: current } = await supabase
    .from("tasks")
    .select("column_id, column_order")
    .eq("id", taskId)
    .single();

  if (!current) return { error: "Task not found" };

  const oldColumnId = current.column_id;

  // Get column names for activity log
  const { data: columns } = await supabase
    .from("task_columns")
    .select("id, name, is_final")
    .in("id", [oldColumnId, columnId]);

  const oldCol = columns?.find((c) => c.id === oldColumnId);
  const newCol = columns?.find((c) => c.id === columnId);

  // Shift tasks in target column to make room
  try {
    await supabase.rpc("increment_column_order", {
      target_column_id: columnId,
      from_order: newOrder,
    });
  } catch {
    // Fallback: shift tasks manually if RPC doesn't exist
    const { data: tasksToShift } = await supabase
      .from("tasks")
      .select("id, column_order")
      .eq("column_id", columnId)
      .gte("column_order", newOrder)
      .neq("id", taskId)
      .order("column_order", { ascending: false });

    if (tasksToShift) {
      for (const t of tasksToShift) {
        await supabase
          .from("tasks")
          .update({ column_order: t.column_order + 1 })
          .eq("id", t.id);
      }
    }
  }

  // Move the task
  const { error } = await supabase
    .from("tasks")
    .update({ column_id: columnId, column_order: newOrder })
    .eq("id", taskId);

  if (error) return { error: error.message };

  // Insert status_change activity (only if column actually changed)
  if (oldColumnId !== columnId) {
    await supabase.from("task_activity").insert({
      task_id: taskId,
      user_id: user.id,
      type: "status_change",
      content: `Moved from ${oldCol?.name ?? "unknown"} to ${newCol?.name ?? "unknown"}`,
      metadata: {
        from_column: oldCol?.name,
        to_column: newCol?.name,
        from_column_id: oldColumnId,
        to_column_id: columnId,
      },
    });

    // If moved to final column, notify creator
    if (newCol?.is_final) {
      const { data: task } = await supabase
        .from("tasks")
        .select("created_by, title")
        .eq("id", taskId)
        .single();

      if (task?.created_by && task.created_by !== user.id) {
        const { data: creator } = await supabase
          .from("profiles")
          .select("id, email, name, role")
          .eq("id", task.created_by)
          .single();

        if (creator) {
          await triggerNotification(
            {
              type: "task_completed",
              title: "Task completed",
              body: task.title,
              entityType: "task",
              entityId: taskId,
            },
            [
              {
                userId: creator.id,
                email: creator.email,
                name: creator.name,
                role: creator.role,
              },
            ]
          );
        }
      }
    }
  }

  // Activity log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "task_moved",
    entity_type: "task",
    entity_id: taskId,
    metadata: { from_column: oldCol?.name, to_column: newCol?.name },
  });

  return { error: null };
}

export async function deleteTask(
  taskId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: task } = await supabase
    .from("tasks")
    .select("title")
    .eq("id", taskId)
    .single();

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "task_deleted",
    entity_type: "task",
    entity_id: taskId,
    metadata: { title: task?.title },
  });

  return { error: null };
}

export async function addComment(
  taskId: string,
  content: string
): Promise<{ data: TaskActivity | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("task_activity")
    .insert({
      task_id: taskId,
      user_id: user.id,
      type: "comment",
      content,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function markComplete(
  taskId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { data: finalCol } = await supabase
    .from("task_columns")
    .select("id")
    .eq("is_final", true)
    .single();

  if (!finalCol) return { error: "No final column found" };

  return moveTask(taskId, finalCol.id, 0);
}

/** Get all active team members for assignee dropdowns */
export async function getTeamMembers(): Promise<{
  data: { id: string; name: string; role: string; photo_url: string | null }[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, photo_url")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ============================================================
// Bulk actions — admin/ops gated
// ============================================================
//
// Drives the sticky bulk-action bar in /admin/tasks (and /ops/tasks
// once we wire it). All three share the same shape:
//
//   - Empty selection → "No tasks selected." up front, no auth call.
//   - Auth + role gate (admin / ops only). Coaches get
//     "Insufficient permissions." matching the deleteFeedback pattern.
//   - Per-row update loop so a single bad row doesn't sink the batch.
//   - Activity log row per affected task for audit symmetry.
//   - Returns `{ updated: number, error: string | null }`. A partial
//     failure surfaces the last error message + a count of successes.

async function gateAdminOrOps(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ userId: string; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: "", error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { userId: user.id, error: "Insufficient permissions." };
  }

  return { userId: user.id, error: null };
}

export async function bulkReassignTasks(
  taskIds: string[],
  assigneeId: string | null,
): Promise<{ updated: number; error: string | null }> {
  try {
    if (taskIds.length === 0) {
      return { updated: 0, error: "No tasks selected." };
    }

    const supabase = await createSupabaseServerClient();
    const gate = await gateAdminOrOps(supabase);
    if (gate.error) return { updated: 0, error: gate.error };

    // Pre-fetch assignee profile once if we're reassigning to a real
    // user — we'll need their notification routing on each task.
    type AssigneeProfile = {
      id: string;
      email: string;
      name: string;
      role: string;
    };
    let assigneeProfile: AssigneeProfile | null = null;
    if (assigneeId) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", assigneeId)
        .single();
      assigneeProfile = (data ?? null) as AssigneeProfile | null;
    }

    let updated = 0;
    let lastError: string | null = null;

    for (const taskId of taskIds) {
      // Read the current task so we can record the from→to change
      // and skip no-op writes.
      const { data: current } = await supabase
        .from("tasks")
        .select("title, assignee_id")
        .eq("id", taskId)
        .single();

      if (!current) {
        lastError = `Task ${taskId} not found.`;
        continue;
      }

      const { error: upErr } = await supabase
        .from("tasks")
        .update({ assignee_id: assigneeId })
        .eq("id", taskId);

      if (upErr) {
        console.error("bulkReassignTasks per-row error:", taskId, upErr);
        lastError = upErr.message;
        continue;
      }

      // Activity row on the task itself — only if it's a real change.
      if (current.assignee_id !== assigneeId) {
        await supabase.from("task_activity").insert({
          task_id: taskId,
          user_id: gate.userId,
          type: "assignment_change",
          content: assigneeId ? "Reassigned in bulk" : "Unassigned in bulk",
          metadata: { from: current.assignee_id, to: assigneeId },
        });

        // Activity log
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "task_bulk_reassigned",
          entity_type: "task",
          entity_id: taskId,
          metadata: { from: current.assignee_id, to: assigneeId },
        });

        // Notify the new assignee (skip if reassigning to self or null).
        if (assigneeProfile && assigneeProfile.id !== gate.userId) {
          await triggerNotification(
            {
              type: "task_assigned",
              title: "Task assigned to you",
              body: current.title,
              entityType: "task",
              entityId: taskId,
            },
            [
              {
                userId: assigneeProfile.id,
                email: assigneeProfile.email,
                name: assigneeProfile.name,
                role: assigneeProfile.role,
              },
            ],
          );
        }
      }

      updated += 1;
    }

    if (updated === 0) {
      return {
        updated: 0,
        error: lastError ?? "Failed to reassign any tasks.",
      };
    }

    return {
      updated,
      error:
        updated < taskIds.length
          ? `Updated ${updated} of ${taskIds.length}. Last error: ${lastError}`
          : null,
    };
  } catch (err) {
    console.error("bulkReassignTasks error:", err);
    return { updated: 0, error: "Failed to reassign tasks." };
  }
}

export async function bulkMarkComplete(
  taskIds: string[],
): Promise<{ updated: number; error: string | null }> {
  try {
    if (taskIds.length === 0) {
      return { updated: 0, error: "No tasks selected." };
    }

    const supabase = await createSupabaseServerClient();
    const gate = await gateAdminOrOps(supabase);
    if (gate.error) return { updated: 0, error: gate.error };

    // Resolve the final column once — all moves target the same id.
    const { data: finalCol } = await supabase
      .from("task_columns")
      .select("id, name")
      .eq("is_final", true)
      .order("position", { ascending: true })
      .limit(1)
      .single();

    if (!finalCol) {
      return { updated: 0, error: "No final column configured." };
    }

    let updated = 0;
    let lastError: string | null = null;

    for (const taskId of taskIds) {
      const { data: current } = await supabase
        .from("tasks")
        .select("column_id, title")
        .eq("id", taskId)
        .single();

      if (!current) {
        lastError = `Task ${taskId} not found.`;
        continue;
      }

      // No-op if it's already in the final column.
      if (current.column_id === finalCol.id) {
        updated += 1;
        continue;
      }

      const { error: upErr } = await supabase
        .from("tasks")
        .update({ column_id: finalCol.id, column_order: 0 })
        .eq("id", taskId);

      if (upErr) {
        console.error("bulkMarkComplete per-row error:", taskId, upErr);
        lastError = upErr.message;
        continue;
      }

      await supabase.from("task_activity").insert({
        task_id: taskId,
        user_id: gate.userId,
        type: "status_change",
        content: `Marked complete in bulk → ${finalCol.name}`,
        metadata: {
          from_column_id: current.column_id,
          to_column_id: finalCol.id,
        },
      });

      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "task_bulk_completed",
        entity_type: "task",
        entity_id: taskId,
        metadata: { to_column: finalCol.name },
      });

      updated += 1;
    }

    if (updated === 0) {
      return {
        updated: 0,
        error: lastError ?? "Failed to mark any tasks complete.",
      };
    }

    return {
      updated,
      error:
        updated < taskIds.length
          ? `Updated ${updated} of ${taskIds.length}. Last error: ${lastError}`
          : null,
    };
  } catch (err) {
    console.error("bulkMarkComplete error:", err);
    return { updated: 0, error: "Failed to mark tasks complete." };
  }
}

export async function bulkChangePriority(
  taskIds: string[],
  priority: TaskPriority,
): Promise<{ updated: number; error: string | null }> {
  try {
    if (taskIds.length === 0) {
      return { updated: 0, error: "No tasks selected." };
    }

    const supabase = await createSupabaseServerClient();
    const gate = await gateAdminOrOps(supabase);
    if (gate.error) return { updated: 0, error: gate.error };

    let updated = 0;
    let lastError: string | null = null;

    for (const taskId of taskIds) {
      const { data: current } = await supabase
        .from("tasks")
        .select("priority")
        .eq("id", taskId)
        .single();

      if (!current) {
        lastError = `Task ${taskId} not found.`;
        continue;
      }

      const { error: upErr } = await supabase
        .from("tasks")
        .update({ priority })
        .eq("id", taskId);

      if (upErr) {
        console.error("bulkChangePriority per-row error:", taskId, upErr);
        lastError = upErr.message;
        continue;
      }

      if (current.priority !== priority) {
        await supabase.from("task_activity").insert({
          task_id: taskId,
          user_id: gate.userId,
          type: "priority_change",
          content: `Priority changed in bulk from ${current.priority} to ${priority}`,
          metadata: { from: current.priority, to: priority },
        });

        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "task_bulk_priority_changed",
          entity_type: "task",
          entity_id: taskId,
          metadata: { from: current.priority, to: priority },
        });
      }

      updated += 1;
    }

    if (updated === 0) {
      return {
        updated: 0,
        error: lastError ?? "Failed to change priority on any tasks.",
      };
    }

    return {
      updated,
      error:
        updated < taskIds.length
          ? `Updated ${updated} of ${taskIds.length}. Last error: ${lastError}`
          : null,
    };
  } catch (err) {
    console.error("bulkChangePriority error:", err);
    return { updated: 0, error: "Failed to change priority on tasks." };
  }
}
