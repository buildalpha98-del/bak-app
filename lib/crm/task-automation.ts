"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { LeadStage } from "@/lib/types/enums";

// ============================================================
// CRM Task Automation
// Called when a lead changes stage or on scheduled checks
// ============================================================

export async function handleLeadStageChange(
  leadId: string,
  newStage: LeadStage,
  ownerId: string | null,
  centreName: string
): Promise<void> {
  const supabase = createSupabaseAdmin();

  // Get "To Do" column
  const { data: todoColumn } = await supabase
    .from("task_columns")
    .select("id")
    .eq("name", "To Do")
    .single();

  if (!todoColumn) return;

  switch (newStage) {
    case "interested":
      await supabase.from("tasks").insert({
        title: `Schedule meeting with ${centreName}`,
        description: `Lead "${centreName}" has reached the Interested stage. Schedule a meeting to discuss their needs.`,
        assignee_id: ownerId,
        column_id: todoColumn.id,
        priority: "medium",
        source: "crm_automation",
        linked_entity_type: "lead",
        linked_entity_id: leadId,
      });

      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "task_created",
        content: `Auto-created task: "Schedule meeting with ${centreName}"`,
      });
      break;

    case "free_trial":
      await supabase.from("tasks").insert({
        title: `Set up trial sessions for ${centreName}`,
        description: `Lead "${centreName}" has entered the Free Trial stage. Create trial sessions in the roster.`,
        assignee_id: ownerId,
        column_id: todoColumn.id,
        priority: "high",
        source: "crm_automation",
        linked_entity_type: "lead",
        linked_entity_id: leadId,
      });

      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "task_created",
        content: `Auto-created task: "Set up trial sessions for ${centreName}"`,
      });
      break;

    case "won":
      await supabase.from("tasks").insert({
        title: `Complete centre profile for ${centreName}`,
        description: `"${centreName}" has been won! Complete the centre profile — add pricing, session preferences, and operational details.`,
        assignee_id: ownerId,
        column_id: todoColumn.id,
        priority: "high",
        source: "crm_automation",
        linked_entity_type: "lead",
        linked_entity_id: leadId,
      });

      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "task_created",
        content: `Auto-created task: "Complete centre profile for ${centreName}"`,
      });
      break;

    case "lost": {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 90);

      await supabase.from("tasks").insert({
        title: `Re-engage ${centreName}`,
        description: `Lead "${centreName}" was marked as Lost. Consider re-engaging in 90 days.`,
        assignee_id: ownerId,
        column_id: todoColumn.id,
        priority: "low",
        due_date: dueDate.toISOString().split("T")[0],
        source: "crm_automation",
        linked_entity_type: "lead",
        linked_entity_id: leadId,
      });

      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "task_created",
        content: `Auto-created task: "Re-engage ${centreName}" (due in 90 days)`,
      });
      break;
    }
  }
}

// ============================================================
// Scheduled task checks (called by cron)
// ============================================================

export async function checkCrmTaskTriggers(): Promise<{
  tasksCreated: number;
}> {
  const supabase = createSupabaseAdmin();
  let tasksCreated = 0;

  const { data: todoColumn } = await supabase
    .from("task_columns")
    .select("id")
    .eq("name", "To Do")
    .single();

  if (!todoColumn) return { tasksCreated: 0 };

  // Proposal sent > 3 days, no stage change
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const { data: staleProposals } = await supabase
    .from("leads")
    .select("id, centre_name, owner_id")
    .eq("stage", "proposal_sent")
    .lt("stage_changed_at", threeDaysAgo.toISOString());

  for (const lead of staleProposals ?? []) {
    // Check if task already exists for this
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("linked_entity_id", lead.id)
      .eq("source", "crm_automation")
      .ilike("title", "%Follow up on proposal%")
      .limit(1);

    if (existingTask && existingTask.length > 0) continue;

    await supabase.from("tasks").insert({
      title: `Follow up on proposal: ${lead.centre_name}`,
      description: `Proposal was sent over 3 days ago with no stage change. Follow up with the centre.`,
      assignee_id: lead.owner_id,
      column_id: todoColumn.id,
      priority: "medium",
      source: "crm_automation",
      linked_entity_type: "lead",
      linked_entity_id: lead.id,
    });

    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "task_created",
      content: `Auto-created task: "Follow up on proposal: ${lead.centre_name}"`,
    });

    tasksCreated++;
  }

  // Trial ending in 3 days
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const today = new Date().toISOString().split("T")[0];
  const threeDaysStr = threeDaysFromNow.toISOString().split("T")[0];

  const { data: endingTrials } = await supabase
    .from("leads")
    .select("id, centre_name, owner_id, trial_end_date")
    .eq("stage", "free_trial")
    .gte("trial_end_date", today)
    .lte("trial_end_date", threeDaysStr);

  for (const lead of endingTrials ?? []) {
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("linked_entity_id", lead.id)
      .eq("source", "crm_automation")
      .ilike("title", "%conversion pitch%")
      .limit(1);

    if (existingTask && existingTask.length > 0) continue;

    await supabase.from("tasks").insert({
      title: `Prepare conversion pitch for ${lead.centre_name}`,
      description: `Trial at "${lead.centre_name}" ends on ${lead.trial_end_date}. Prepare a proposal for converting to a permanent arrangement.`,
      assignee_id: lead.owner_id,
      column_id: todoColumn.id,
      priority: "high",
      due_date: lead.trial_end_date,
      source: "crm_automation",
      linked_entity_type: "lead",
      linked_entity_id: lead.id,
    });

    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "task_created",
      content: `Auto-created task: "Prepare conversion pitch for ${lead.centre_name}"`,
    });

    tasksCreated++;
  }

  // Trial ended (trial_end_date has passed) — auto-create proposal task
  const { data: endedTrials } = await supabase
    .from("leads")
    .select("id, centre_name, owner_id, trial_end_date")
    .eq("stage", "free_trial")
    .lt("trial_end_date", today);

  for (const lead of endedTrials ?? []) {
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("linked_entity_id", lead.id)
      .eq("source", "crm_automation")
      .ilike("title", "%Trial complete%")
      .limit(1);

    if (existingTask && existingTask.length > 0) continue;

    await supabase.from("tasks").insert({
      title: `Trial complete — prepare proposal for ${lead.centre_name}`,
      description: `Trial at "${lead.centre_name}" ended on ${lead.trial_end_date}. Generate performance report and prepare proposal.`,
      assignee_id: lead.owner_id,
      column_id: todoColumn.id,
      priority: "high",
      source: "crm_automation",
      linked_entity_type: "lead",
      linked_entity_id: lead.id,
    });

    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "system",
      content: `Trial period ended. Performance report generated.`,
    });

    tasksCreated++;
  }

  return { tasksCreated };
}
