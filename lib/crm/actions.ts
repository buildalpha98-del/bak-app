"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Lead, LeadActivity } from "@/lib/types/database";
import type { LeadStage, LeadSource } from "@/lib/types/enums";
import { handleLeadStageChange } from "@/lib/crm/task-automation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface LeadWithOwner extends Lead {
  owner_name: string | null;
}

export interface LeadActivityWithUser extends LeadActivity {
  user_name: string | null;
}

export interface PipelineSummary {
  stages: { stage: LeadStage; count: number; totalValue: number }[];
  total: number;
}

// ============================================================
// List leads with filters
// ============================================================

export async function getLeads(filters?: {
  stage?: LeadStage;
  source?: LeadSource;
  ownerId?: string;
  search?: string;
  sortBy?: "newest" | "oldest" | "highest_value" | "longest_in_stage";
}): Promise<{ data: LeadWithOwner[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("leads")
      .select("*");

    if (filters?.stage) query = query.eq("stage", filters.stage);
    if (filters?.source) query = query.eq("source", filters.source);
    if (filters?.ownerId) query = query.eq("owner_id", filters.ownerId);
    if (filters?.search) {
      query = query.or(
        `centre_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`
      );
    }

    switch (filters?.sortBy) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "highest_value":
        query = query.order("estimated_value", { ascending: false, nullsFirst: false });
        break;
      case "longest_in_stage":
        query = query.order("stage_changed_at", { ascending: true });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };

    // Batch-fetch owner names to avoid N+1 and FK hint issues
    const ownerIds = [...new Set((data ?? []).map((l) => l.owner_id).filter(Boolean))] as string[];
    const ownerMap = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", ownerIds);
      for (const p of profiles ?? []) {
        ownerMap.set(p.id, p.name);
      }
    }

    return {
      data: (data ?? []).map((lead) => ({
        ...lead,
        owner_name: lead.owner_id ? (ownerMap.get(lead.owner_id) ?? null) : null,
      } as LeadWithOwner)),
      error: null,
    };
  } catch (err) {
    console.error("getLeads error:", err);
    return { data: [], error: "Failed to load leads." };
  }
}

// ============================================================
// Get single lead detail
// ============================================================

export async function getLeadDetail(leadId: string): Promise<{
  data: { lead: LeadWithOwner; activities: LeadActivityWithUser[] } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error || !lead) return { data: null, error: error?.message ?? "Lead not found." };

    const { data: activities } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    // Fetch owner name
    let ownerName: string | null = null;
    if (lead.owner_id) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", lead.owner_id)
        .single();
      ownerName = ownerProfile?.name ?? null;
    }

    // Fetch activity user names
    const activityUserIds = [...new Set((activities ?? []).map((a) => a.created_by).filter(Boolean))] as string[];
    const userMap = new Map<string, string>();
    if (activityUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", activityUserIds);
      for (const p of profiles ?? []) {
        userMap.set(p.id, p.name);
      }
    }

    return {
      data: {
        lead: { ...lead, owner_name: ownerName } as LeadWithOwner,
        activities: (activities ?? []).map((a) => ({
          ...a,
          user_name: a.created_by ? (userMap.get(a.created_by) ?? null) : null,
        } as LeadActivityWithUser)),
      },
      error: null,
    };
  } catch (err) {
    console.error("getLeadDetail error:", err);
    return { data: null, error: "Failed to load lead." };
  }
}

// ============================================================
// Create lead
// ============================================================

export async function createLead(input: {
  centre_name: string;
  type?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  source?: LeadSource;
  stage?: LeadStage;
  estimated_value?: number;
  notes?: string;
  owner_id?: string;
}): Promise<{ data: Lead | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Duplicate detection
    if (input.centre_name) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id, centre_name, stage")
        .or(
          `centre_name.ilike.${input.centre_name}${input.contact_email ? `,contact_email.eq.${input.contact_email}` : ""}`
        )
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          data: null,
          error: `Potential duplicate: "${existing[0].centre_name}" already exists (stage: ${existing[0].stage}). Lead ID: ${existing[0].id}`,
        };
      }
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        centre_name: input.centre_name,
        type: input.type as Lead["type"],
        contact_name: input.contact_name ?? null,
        contact_email: input.contact_email ?? null,
        contact_phone: input.contact_phone ?? null,
        address: input.address ?? null,
        source: input.source ?? "manual",
        stage: input.stage ?? "cold_lead",
        estimated_value: input.estimated_value ?? null,
        notes: input.notes ?? null,
        owner_id: input.owner_id ?? user?.id ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    // Create activity
    await supabase.from("lead_activities").insert({
      lead_id: data.id,
      type: "system",
      content: `Lead created from ${input.source ?? "manual"} entry`,
      created_by: user?.id ?? null,
    });

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { data, error: null };
  } catch (err) {
    console.error("createLead error:", err);
    return { data: null, error: "Failed to create lead." };
  }
}

// ============================================================
// Update lead fields
// ============================================================

export async function updateLead(
  leadId: string,
  updates: Partial<Pick<Lead, "centre_name" | "type" | "contact_name" | "contact_email" | "contact_phone" | "address" | "estimated_value" | "notes" | "owner_id" | "trial_start_date" | "trial_end_date">>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) return { error: error.message };

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("updateLead error:", err);
    return { error: "Failed to update lead." };
  }
}

// ============================================================
// Change lead stage
// ============================================================

export async function changeLeadStage(
  leadId: string,
  newStage: LeadStage,
  reason?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Get current lead
    const { data: lead } = await supabase
      .from("leads")
      .select("stage, centre_name")
      .eq("id", leadId)
      .single();

    if (!lead) return { error: "Lead not found." };

    const updates: Record<string, unknown> = {
      stage: newStage,
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (newStage === "lost" && reason) updates.lost_reason = reason;
    if (newStage === "churned" && reason) updates.churn_reason = reason;

    const { error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId);

    if (error) return { error: error.message };

    // Create stage change activity
    const content = reason
      ? `Stage changed from ${formatStage(lead.stage)} to ${formatStage(newStage)}. Reason: ${reason}`
      : `Stage changed from ${formatStage(lead.stage)} to ${formatStage(newStage)}`;

    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      type: "stage_change",
      content,
      metadata: { from: lead.stage, to: newStage, reason },
      created_by: user?.id ?? null,
    });

    // Trigger task automation for key stage changes
    const { data: leadForAutomation } = await supabase
      .from("leads")
      .select("owner_id")
      .eq("id", leadId)
      .single();

    await handleLeadStageChange(leadId, newStage, leadForAutomation?.owner_id ?? null, lead.centre_name);

    // Sequence automation: stop current, start new if trigger matches
    const admin = createSupabaseAdmin();

    // Stop current sequence if any
    await admin
      .from("email_sends")
      .update({ status: "skipped" })
      .eq("lead_id", leadId)
      .eq("status", "scheduled");

    // Check for sequence triggered by new stage
    const { data: triggerSequence } = await admin
      .from("email_sequences")
      .select("id, email_sequence_steps(id, step_number, delay_days)")
      .eq("trigger_stage", newStage)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (triggerSequence) {
      // Start new sequence
      await admin
        .from("leads")
        .update({ active_sequence_id: triggerSequence.id, sequence_paused: false })
        .eq("id", leadId);

      // Schedule all steps
      const steps = triggerSequence.email_sequence_steps as unknown as { id: string; step_number: number; delay_days: number }[];
      const now = new Date();

      for (const step of steps) {
        const scheduledFor = new Date(now);
        scheduledFor.setDate(scheduledFor.getDate() + step.delay_days);

        await admin.from("email_sends").insert({
          lead_id: leadId,
          sequence_id: triggerSequence.id,
          step_id: step.id,
          status: "scheduled",
          scheduled_for: scheduledFor.toISOString(),
        });
      }

      await admin.from("lead_activities").insert({
        lead_id: leadId,
        type: "system",
        content: `Email sequence started automatically`,
      });
    } else {
      // No trigger sequence — clear active sequence
      await admin
        .from("leads")
        .update({ active_sequence_id: null, sequence_paused: false })
        .eq("id", leadId);
    }

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("changeLeadStage error:", err);
    return { error: "Failed to change stage." };
  }
}

// ============================================================
// Add lead activity
// ============================================================

export async function addLeadActivity(input: {
  leadId: string;
  type: "note" | "call" | "meeting" | "email_sent";
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("lead_activities").insert({
      lead_id: input.leadId,
      type: input.type,
      content: input.content,
      metadata: input.metadata ?? null,
      created_by: user?.id ?? null,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("addLeadActivity error:", err);
    return { error: "Failed to add activity." };
  }
}

// ============================================================
// Delete lead
// ============================================================

export async function deleteLead(leadId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("leads").delete().eq("id", leadId);

    if (error) return { error: error.message };

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("deleteLead error:", err);
    return { error: "Failed to delete lead." };
  }
}

// ============================================================
// Bulk operations
// ============================================================

export async function bulkChangeStage(
  leadIds: string[],
  newStage: LeadStage
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("leads")
      .update({
        stage: newStage,
        stage_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", leadIds);

    if (error) return { error: error.message };

    // Create activities for each
    for (const id of leadIds) {
      await supabase.from("lead_activities").insert({
        lead_id: id,
        type: "stage_change",
        content: `Bulk stage change to ${formatStage(newStage)}`,
        created_by: user?.id ?? null,
      });
    }

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("bulkChangeStage error:", err);
    return { error: "Failed to update leads." };
  }
}

export async function bulkAssignOwner(
  leadIds: string[],
  ownerId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("leads")
      .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
      .in("id", leadIds);

    if (error) return { error: error.message };

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("bulkAssignOwner error:", err);
    return { error: "Failed to assign leads." };
  }
}

export async function bulkDeleteLeads(
  leadIds: string[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("leads").delete().in("id", leadIds);

    if (error) return { error: error.message };

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("bulkDeleteLeads error:", err);
    return { error: "Failed to delete leads." };
  }
}

// ============================================================
// Pipeline summary
// ============================================================

export async function getPipelineSummary(): Promise<{
  data: PipelineSummary | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: leads } = await supabase
      .from("leads")
      .select("stage, estimated_value");

    if (!leads) return { data: null, error: "No data." };

    const stageMap = new Map<LeadStage, { count: number; totalValue: number }>();
    const allStages: LeadStage[] = [
      "cold_lead", "contacted", "interested", "free_trial",
      "proposal_sent", "won", "lost", "churned",
    ];

    for (const stage of allStages) {
      stageMap.set(stage, { count: 0, totalValue: 0 });
    }

    for (const lead of leads) {
      const entry = stageMap.get(lead.stage as LeadStage)!;
      entry.count++;
      entry.totalValue += lead.estimated_value ?? 0;
    }

    return {
      data: {
        stages: allStages.map((stage) => ({
          stage,
          count: stageMap.get(stage)!.count,
          totalValue: stageMap.get(stage)!.totalValue,
        })),
        total: leads.length,
      },
      error: null,
    };
  } catch (err) {
    console.error("getPipelineSummary error:", err);
    return { data: null, error: "Failed to load pipeline." };
  }
}

// ============================================================
// Get staff members for owner assignment
// ============================================================

export async function getCrmStaffMembers(): Promise<{
  data: { id: string; name: string; role: string }[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, role")
      .in("role", ["admin", "ops"])
      .eq("status", "active")
      .order("name");

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getCrmStaffMembers error:", err);
    return { data: [], error: "Failed to load staff." };
  }
}

// ============================================================
// CSV import
// ============================================================

export async function importLeadsFromCsv(
  rows: {
    centre_name: string;
    type?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    estimated_value?: number;
    notes?: string;
  }[],
  defaults: {
    stage: LeadStage;
    owner_id: string;
    duplicateAction: "skip" | "create";
  }
): Promise<{
  data: { created: number; skipped: number; errors: number };
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      if (!row.centre_name?.trim()) {
        errors++;
        continue;
      }

      // Check for duplicates
      if (defaults.duplicateAction === "skip") {
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .or(
            `centre_name.ilike.${row.centre_name}${row.contact_email ? `,contact_email.eq.${row.contact_email}` : ""}`
          )
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }
      }

      const { data: lead, error: insertError } = await supabase
        .from("leads")
        .insert({
          centre_name: row.centre_name.trim(),
          type: (row.type as Lead["type"]) ?? null,
          contact_name: row.contact_name ?? null,
          contact_email: row.contact_email ?? null,
          contact_phone: row.contact_phone ?? null,
          address: row.address ?? null,
          estimated_value: row.estimated_value ?? null,
          notes: row.notes ?? null,
          source: "csv_import" as const,
          stage: defaults.stage,
          owner_id: defaults.owner_id,
        })
        .select("id")
        .single();

      if (insertError || !lead) {
        errors++;
        continue;
      }

      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        type: "system",
        content: "Lead imported from CSV",
        created_by: user?.id ?? null,
      });

      created++;
    }

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { data: { created, skipped, errors }, error: null };
  } catch (err) {
    console.error("importLeadsFromCsv error:", err);
    return { data: { created: 0, skipped: 0, errors: 0 }, error: "Import failed." };
  }
}

// ============================================================
// CRM dashboard widget data
// ============================================================

export async function getCrmDashboardData(): Promise<{
  data: {
    byStage: { stage: string; count: number }[];
    newThisWeek: number;
    conversionRate: number | null;
    totalPipelineValue: number;
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: leads } = await supabase
      .from("leads")
      .select("stage, estimated_value, created_at");

    if (!leads) return { data: null, error: "No data." };

    const byStage = new Map<string, number>();
    for (const l of leads) {
      byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newThisWeek = leads.filter((l) => new Date(l.created_at) >= weekAgo).length;

    const proposalSent = leads.filter((l) =>
      ["proposal_sent", "won", "lost"].includes(l.stage)
    ).length;
    const won = leads.filter((l) => l.stage === "won").length;
    const conversionRate = proposalSent > 0 ? Math.round((won / proposalSent) * 100) : null;

    const activeStages = ["cold_lead", "contacted", "interested", "free_trial", "proposal_sent"];
    const totalPipelineValue = leads
      .filter((l) => activeStages.includes(l.stage))
      .reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);

    return {
      data: {
        byStage: Array.from(byStage.entries()).map(([stage, count]) => ({ stage, count })),
        newThisWeek,
        conversionRate,
        totalPipelineValue,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCrmDashboardData error:", err);
    return { data: null, error: "Failed to load CRM data." };
  }
}

// ============================================================
// Helpers
// ============================================================

function formatStage(stage: string): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
