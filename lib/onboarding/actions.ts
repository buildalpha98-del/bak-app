"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  CentreOnboardingChecklist,
  CentreOnboardingStep,
  CentreOnboardingEmail,
} from "@/lib/types/database";

// ─────────────────────────────────────────────
// The 10 onboarding steps definition
// ─────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  { number: 1, name: "Complete centre profile", type: "manual" as const },
  { number: 2, name: "Upload centre logo", type: "manual" as const },
  { number: 3, name: "Send welcome email", type: "auto_email" as const },
  { number: 4, name: "Request child list", type: "auto_email" as const },
  { number: 5, name: "Import child list", type: "manual" as const },
  { number: 6, name: "Invite to client portal", type: "manual" as const },
  { number: 7, name: "Schedule first session", type: "manual" as const },
  { number: 8, name: "Assign coach", type: "manual" as const },
  { number: 9, name: "First session prep email", type: "auto_email" as const },
  { number: 10, name: "Post first-session follow-up", type: "auto_email" as const },
] as const;

// ─────────────────────────────────────────────
// ONBOARDING TRIGGERS
// ─────────────────────────────────────────────

/**
 * Start onboarding for a newly created centre.
 * Creates checklist + 10 steps, triggers step 3 immediately, schedules step 4.
 */
export async function startCentreOnboarding(
  centreId: string
): Promise<{ checklistId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Check if checklist already exists
  const { data: existing } = await supabase
    .from("centre_onboarding_checklists")
    .select("id")
    .eq("centre_id", centreId)
    .maybeSingle();

  if (existing) return { checklistId: existing.id };

  // Create checklist
  const { data: checklist, error: checklistErr } = await supabase
    .from("centre_onboarding_checklists")
    .insert({ centre_id: centreId })
    .select("id")
    .single();

  if (checklistErr) return { error: checklistErr.message };

  // Create all 10 steps
  const now = new Date();
  const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const steps = ONBOARDING_STEPS.map((s) => ({
    checklist_id: checklist.id,
    step_number: s.number,
    step_name: s.name,
    step_type: s.type,
    status: "pending" as const,
    scheduled_for: s.number === 4 ? twoDaysLater.toISOString() : null,
  }));

  await supabase.from("centre_onboarding_steps").insert(steps);

  // Auto-trigger step 3 (welcome email) — mark as in_progress
  await supabase
    .from("centre_onboarding_steps")
    .update({ status: "in_progress" })
    .eq("checklist_id", checklist.id)
    .eq("step_number", 3);

  // Notify ops
  const { data: centre } = await supabase
    .from("centres")
    .select("name")
    .eq("id", centreId)
    .single();

  await supabase.from("notifications").insert({
    user_id: user.id,
    type: "centre_onboarding_started",
    title: "New centre onboarding started",
    message: `New centre onboarding started: ${centre?.name ?? "Unknown"}`,
    tier: "important",
  });

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "centre_onboarding_started",
    entity_type: "centre",
    entity_id: centreId,
  });

  revalidatePath(`/admin/centres/${centreId}`);
  return { checklistId: checklist.id };
}

// ─────────────────────────────────────────────
// CHECKLIST READS
// ─────────────────────────────────────────────

/**
 * Get onboarding checklist for a centre with all steps and email records.
 */
export async function getCentreOnboarding(centreId: string): Promise<{
  checklist: CentreOnboardingChecklist;
  steps: CentreOnboardingStep[];
  emails: CentreOnboardingEmail[];
} | null> {
  const supabase = await createSupabaseServerClient();

  const { data: checklist } = await supabase
    .from("centre_onboarding_checklists")
    .select("*")
    .eq("centre_id", centreId)
    .maybeSingle();

  if (!checklist) return null;

  const [stepsRes, emailsRes] = await Promise.all([
    supabase
      .from("centre_onboarding_steps")
      .select("*")
      .eq("checklist_id", checklist.id)
      .order("step_number", { ascending: true }),
    supabase
      .from("centre_onboarding_emails")
      .select("*")
      .eq("checklist_id", checklist.id)
      .order("sent_at", { ascending: false }),
  ]);

  return {
    checklist: checklist as CentreOnboardingChecklist,
    steps: (stepsRes.data as CentreOnboardingStep[]) ?? [],
    emails: (emailsRes.data as CentreOnboardingEmail[]) ?? [],
  };
}

/**
 * Get all active onboarding checklists for the ops widget.
 */
export async function getActiveOnboardings(): Promise<
  Array<{
    checklist: CentreOnboardingChecklist;
    centre: { id: string; name: string };
    completedSteps: number;
    totalSteps: number;
    daysSinceStart: number;
  }>
> {
  const supabase = await createSupabaseServerClient();

  const { data: checklists } = await supabase
    .from("centre_onboarding_checklists")
    .select("*, centres!inner(id, name)")
    .eq("status", "in_progress")
    .order("started_at", { ascending: false });

  if (!checklists || checklists.length === 0) return [];

  const results = [];
  for (const row of checklists) {
    const { data: steps } = await supabase
      .from("centre_onboarding_steps")
      .select("status")
      .eq("checklist_id", row.id);

    const completedSteps = (steps ?? []).filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length;

    const daysSinceStart = Math.floor(
      (Date.now() - new Date(row.started_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const centre = (row as Record<string, unknown>).centres as { id: string; name: string };

    results.push({
      checklist: row as unknown as CentreOnboardingChecklist,
      centre,
      completedSteps,
      totalSteps: 10,
      daysSinceStart,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// STEP ACTIONS
// ─────────────────────────────────────────────

/**
 * Complete an onboarding step manually.
 */
export async function completeOnboardingStep(
  stepId: string,
  notes?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("centre_onboarding_steps")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      notes: notes || null,
    })
    .eq("id", stepId);

  if (error) return { error: error.message };

  // Check if all steps are done
  const { data: step } = await supabase
    .from("centre_onboarding_steps")
    .select("checklist_id")
    .eq("id", stepId)
    .single();

  if (step) {
    await checkOnboardingCompletion(step.checklist_id);
  }

  revalidatePath("/admin/centres");
  return { success: true };
}

/**
 * Skip an onboarding step with a reason.
 */
export async function skipOnboardingStep(
  stepId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("centre_onboarding_steps")
    .update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      notes: reason,
    })
    .eq("id", stepId);

  if (error) return { error: error.message };

  const { data: step } = await supabase
    .from("centre_onboarding_steps")
    .select("checklist_id")
    .eq("id", stepId)
    .single();

  if (step) {
    await checkOnboardingCompletion(step.checklist_id);
  }

  revalidatePath("/admin/centres");
  return { success: true };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

/**
 * Check if all steps in a checklist are completed/skipped and update checklist status.
 */
async function checkOnboardingCompletion(checklistId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: steps } = await supabase
    .from("centre_onboarding_steps")
    .select("status")
    .eq("checklist_id", checklistId);

  if (!steps) return;

  const allDone = steps.every(
    (s) => s.status === "completed" || s.status === "skipped"
  );

  if (allDone) {
    await supabase
      .from("centre_onboarding_checklists")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", checklistId);
  }
}
