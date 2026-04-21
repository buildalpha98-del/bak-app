"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";
import { sendEmail } from "@/lib/email/send";
import { demoScheduledEmail } from "@/lib/email/templates";
import { changeLeadStage } from "@/lib/crm/actions";
import type { DemoSession } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface DemoSessionWithCoach extends DemoSession {
  coach_name: string | null;
}

// ============================================================
// Schedule a demo session for a lead
// ============================================================

export async function scheduleDemoSession(input: {
  leadId: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number;
  coachId?: string;
  attendeesExpected?: number;
}): Promise<{ data: DemoSession | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // 1. Insert demo session
    const { data: demo, error: insertError } = await supabase
      .from("demo_sessions")
      .insert({
        lead_id: input.leadId,
        scheduled_date: input.scheduledDate,
        scheduled_time: input.scheduledTime,
        duration_minutes: input.durationMinutes ?? 60,
        coach_id: input.coachId ?? null,
        attendees_expected: input.attendeesExpected ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError || !demo) {
      return { data: null, error: insertError?.message ?? "Failed to create demo session." };
    }

    // 2. Get lead details
    const { data: lead } = await supabase
      .from("leads")
      .select("centre_name, stage, contact_email, contact_name, owner_id")
      .eq("id", input.leadId)
      .single();

    if (!lead) return { data: demo, error: null };

    // 3. Advance stage to free_trial if before it
    const earlyStages = ["cold_lead", "contacted", "interested"];
    if (earlyStages.includes(lead.stage)) {
      await changeLeadStage(input.leadId, "free_trial");
    }

    // 4. Log activity
    await supabase.from("lead_activities").insert({
      lead_id: input.leadId,
      type: "meeting",
      content: `Demo session scheduled for ${input.scheduledDate} at ${input.scheduledTime}`,
      metadata: { demo_session_id: demo.id, coach_id: input.coachId },
      created_by: user.id,
    });

    // 5. Notify coach
    if (input.coachId) {
      const admin = createSupabaseAdmin();
      const { data: coach } = await admin
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", input.coachId)
        .single();

      if (coach) {
        await triggerNotification(
          {
            type: "demo_scheduled",
            title: `Demo at ${lead.centre_name}`,
            body: `You've been assigned a demo on ${input.scheduledDate} at ${input.scheduledTime}`,
            entityType: "demo_session",
            entityId: demo.id,
          },
          [{ userId: coach.id, email: coach.email, name: coach.name, role: coach.role }]
        );

        // 6. Send confirmation email to lead contact
        if (lead.contact_email && lead.contact_name) {
          const { subject, html } = demoScheduledEmail(
            lead.contact_name,
            lead.centre_name,
            input.scheduledDate,
            input.scheduledTime,
            coach.name ?? "our coaching team",
            input.durationMinutes ?? 60
          );
          await sendEmail(lead.contact_email, subject, html);
        }
      }
    }

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { data: demo, error: null };
  } catch (err) {
    console.error("scheduleDemoSession error:", err);
    return { data: null, error: "Failed to schedule demo session." };
  }
}

// ============================================================
// Record outcome of a delivered demo
// ============================================================

export async function recordDemoOutcome(input: {
  demoId: string;
  attendeesActual?: number;
  outcome: "positive" | "neutral" | "negative";
  coachFeedback?: string;
  decisionMakerFeedback?: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // 1. Update demo session
    const { data: demo, error: updateError } = await supabase
      .from("demo_sessions")
      .update({
        status: "delivered",
        attendees_actual: input.attendeesActual ?? null,
        outcome: input.outcome,
        coach_feedback: input.coachFeedback ?? null,
        decision_maker_feedback: input.decisionMakerFeedback ?? null,
      })
      .eq("id", input.demoId)
      .select("lead_id")
      .single();

    if (updateError || !demo) {
      return { error: updateError?.message ?? "Demo session not found." };
    }

    // 2. Get lead info for activity + task
    const { data: lead } = await supabase
      .from("leads")
      .select("centre_name, owner_id")
      .eq("id", demo.lead_id)
      .single();

    // 3. Log activity
    await supabase.from("lead_activities").insert({
      lead_id: demo.lead_id,
      type: "meeting",
      content: `Demo delivered. Outcome: ${input.outcome}`,
      metadata: {
        demo_session_id: input.demoId,
        outcome: input.outcome,
        attendees_actual: input.attendeesActual,
      },
      created_by: user.id,
    });

    // 4. Create follow-up task for lead owner
    if (lead?.owner_id) {
      const admin = createSupabaseAdmin();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 2);

      await admin.from("tasks").insert({
        title: `Follow up after demo at ${lead.centre_name}`,
        assignee_id: lead.owner_id,
        due_date: dueDate.toISOString().split("T")[0],
        priority: "high",
        linked_entity_type: "lead",
        linked_entity_id: demo.lead_id,
        source: "crm_automation",
      });

      // 5. Notify lead owner
      const { data: owner } = await admin
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", lead.owner_id)
        .single();

      if (owner) {
        await triggerNotification(
          {
            type: "demo_outcome_recorded",
            title: `Demo outcome: ${input.outcome}`,
            body: `Demo at ${lead.centre_name} was delivered with a ${input.outcome} outcome`,
            entityType: "lead",
            entityId: demo.lead_id,
          },
          [{ userId: owner.id, email: owner.email, name: owner.name, role: owner.role }]
        );
      }
    }

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("recordDemoOutcome error:", err);
    return { error: "Failed to record demo outcome." };
  }
}

// ============================================================
// Get all demos for a lead
// ============================================================

export async function getDemosForLead(
  leadId: string
): Promise<{ data: DemoSessionWithCoach[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: demos, error } = await supabase
      .from("demo_sessions")
      .select("*")
      .eq("lead_id", leadId)
      .order("scheduled_date", { ascending: false });

    if (error) return { data: [], error: error.message };
    if (!demos || demos.length === 0) return { data: [], error: null };

    // Batch-fetch coach names
    const coachIds = [...new Set(demos.map((d) => d.coach_id).filter(Boolean))] as string[];
    const coachMap: Record<string, string> = {};

    if (coachIds.length > 0) {
      const { data: coaches } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", coachIds);

      if (coaches) {
        for (const c of coaches) coachMap[c.id] = c.name ?? "Unknown";
      }
    }

    const enriched: DemoSessionWithCoach[] = demos.map((d) => ({
      ...d,
      coach_name: d.coach_id ? (coachMap[d.coach_id] ?? null) : null,
    }));

    return { data: enriched, error: null };
  } catch (err) {
    console.error("getDemosForLead error:", err);
    return { data: [], error: "Failed to load demo sessions." };
  }
}

// ============================================================
// Cancel a demo session
// ============================================================

export async function cancelDemoSession(
  demoId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: demo, error: updateError } = await supabase
      .from("demo_sessions")
      .update({ status: "cancelled" })
      .eq("id", demoId)
      .select("lead_id")
      .single();

    if (updateError || !demo) {
      return { error: updateError?.message ?? "Demo session not found." };
    }

    await supabase.from("lead_activities").insert({
      lead_id: demo.lead_id,
      type: "meeting",
      content: "Demo session cancelled",
      metadata: { demo_session_id: demoId },
      created_by: user?.id ?? null,
    });

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("cancelDemoSession error:", err);
    return { error: "Failed to cancel demo session." };
  }
}
