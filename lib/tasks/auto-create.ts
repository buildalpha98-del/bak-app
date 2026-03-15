import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";
import type { Task } from "@/lib/types/database";
import type { TaskPriority } from "@/lib/types/enums";

// ============================================================
// Auto-create tasks from system events
// ============================================================

interface AutoCreateTaskInput {
  title: string;
  description?: string;
  assigneeId?: string;
  priority: TaskPriority;
  linkedEntityType?: string;
  linkedEntityId?: string;
  source:
    | "equipment_issue"
    | "compliance_expiry"
    | "shift_declined"
    | "invoice_flagged"
    | "low_session_rating"
    | "rerostering"
    | "churn_risk"
    | "invoice_overdue";
}

/**
 * Create a task from a system event (equipment issue, compliance expiry, etc.).
 * Uses admin client to bypass RLS.
 * Deduplicates: skips if an open task with same linked entity + source exists.
 */
export async function autoCreateTask(
  input: AutoCreateTaskInput
): Promise<{ data: Task | null; error: string | null }> {
  const admin = createSupabaseAdmin();

  // 1. Deduplication check
  if (input.linkedEntityType && input.linkedEntityId) {
    const { data: existing } = await admin
      .from("tasks")
      .select("id, column_id")
      .eq("linked_entity_type", input.linkedEntityType)
      .eq("linked_entity_id", input.linkedEntityId)
      .eq("source", input.source)
      .limit(1);

    if (existing && existing.length > 0) {
      // Check if it's in a non-final column (still open)
      const { data: col } = await admin
        .from("task_columns")
        .select("is_final")
        .eq("id", existing[0].column_id)
        .single();

      if (col && !col.is_final) {
        // Task already exists and is open — skip
        const { data: fullTask } = await admin
          .from("tasks")
          .select("*")
          .eq("id", existing[0].id)
          .single();

        return { data: fullTask, error: null };
      }
    }
  }

  // 2. Find first non-final column
  const { data: firstCol } = await admin
    .from("task_columns")
    .select("id")
    .eq("is_final", false)
    .order("position", { ascending: true })
    .limit(1)
    .single();

  if (!firstCol) return { data: null, error: "No columns available" };

  // 3. Get max column_order
  const { data: maxOrder } = await admin
    .from("tasks")
    .select("column_order")
    .eq("column_id", firstCol.id)
    .order("column_order", { ascending: false })
    .limit(1)
    .single();

  const newOrder = (maxOrder?.column_order ?? -1) + 1;

  // 4. Insert task
  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description ?? null,
      assignee_id: input.assigneeId ?? null,
      priority: input.priority,
      column_id: firstCol.id,
      column_order: newOrder,
      source: input.source,
      created_by: null, // system-created
      linked_entity_type: input.linkedEntityType ?? null,
      linked_entity_id: input.linkedEntityId ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // 5. Insert created activity
  await admin.from("task_activity").insert({
    task_id: task.id,
    user_id: null, // system
    type: "created",
    content: `Auto-created from ${input.source.replace(/_/g, " ")}`,
    metadata: { source: input.source },
  });

  // 6. Notify assignee
  if (input.assigneeId) {
    const { data: assignee } = await admin
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

  // 7. Activity log
  await admin.from("activity_log").insert({
    user_id: null,
    action: "task_auto_created",
    entity_type: "task",
    entity_id: task.id,
    metadata: {
      title: input.title,
      source: input.source,
      linked_entity_type: input.linkedEntityType,
      linked_entity_id: input.linkedEntityId,
    },
  });

  return { data: task, error: null };
}
