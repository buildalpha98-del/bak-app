"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  CentreOnboardingChecklist,
  CentreOnboardingStep,
  CentreOnboardingEmail,
} from "@/lib/types/database";
import {
  ONBOARDING_EMAIL_KEYS,
  ONBOARDING_TOTAL_STEPS,
  type OnboardingEmailKey,
} from "./constants";

// ─────────────────────────────────────────────
// The 10 onboarding steps definition
// ─────────────────────────────────────────────

const ONBOARDING_STEPS = [
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

const TOTAL_STEPS = ONBOARDING_TOTAL_STEPS;

// ─────────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────────

type Role = "admin" | "ops" | "coach" | "client" | "parent";

type AuthResult =
  | { ok: true; user: { id: string }; role: Role }
  | { ok: false; error: string };

async function requireAdminOrOps(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? null) as Role | null;
  if (!role || (role !== "admin" && role !== "ops")) {
    return {
      ok: false,
      error: "Only admin or ops can update centre onboarding.",
    };
  }

  return { ok: true, user: { id: user.id }, role };
}

// ─────────────────────────────────────────────
// LIFECYCLE EMAIL QUEUE
// ─────────────────────────────────────────────

/**
 * Idempotently queue an onboarding lifecycle email. The cron handler
 * (`/api/cron/onboarding-emails`) picks up queued rows (sent_at IS NULL)
 * on its next run and dispatches via Resend.
 *
 * The (checklist_id, email_type) unique index introduced in migration
 * 049 means a duplicate insert silently no-ops — callers don't need
 * to pre-check.
 */
export async function queueOnboardingEmail(
  checklistId: string,
  emailKey: OnboardingEmailKey
): Promise<{ data: { queued: boolean } | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  // Look up the centre contact so we can stamp `sent_to`. The actual
  // send happens in the cron; we capture the address at queue time so
  // a later contact-email change doesn't redirect an in-flight queue.
  const { data: checklist } = await supabase
    .from("centre_onboarding_checklists")
    .select("centre_id")
    .eq("id", checklistId)
    .maybeSingle();

  if (!checklist) {
    return { data: null, error: "Onboarding checklist not found." };
  }

  const { data: centre } = await supabase
    .from("centres")
    .select("contact_email")
    .eq("id", checklist.centre_id)
    .maybeSingle();

  const sentTo = centre?.contact_email ?? "";
  if (!sentTo) {
    // No contact email — log nothing rather than queueing a junk row.
    return {
      data: null,
      error: "Centre has no contact email; cannot queue onboarding email.",
    };
  }

  // Idempotent insert: rely on the (checklist_id, email_type) unique
  // index. A duplicate returns a 23505 which we swallow as no-op.
  const { error } = await supabase.from("centre_onboarding_emails").insert({
    checklist_id: checklistId,
    step_number: 0, // sentinel: lifecycle rows are not bound to a step
    email_type: emailKey,
    sent_to: sentTo,
    sent_at: null,
  });

  if (error) {
    // 23505 = unique_violation. Already queued or already sent.
    if (error.code === "23505") {
      return { data: { queued: false }, error: null };
    }
    return { data: null, error: error.message };
  }

  return { data: { queued: true }, error: null };
}

// ─────────────────────────────────────────────
// ONBOARDING TRIGGERS
// ─────────────────────────────────────────────

/**
 * Start onboarding for a newly created centre.
 * Creates checklist + 10 steps, triggers step 3 immediately, schedules step 4.
 * Idempotent — returns the existing checklist id if one already exists.
 */
export async function startCentreOnboarding(
  centreId: string
): Promise<{ checklistId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  // Auto-trigger step 3 (welcome email) — mark as in_progress so the
  // cron's per-step handler picks it up immediately.
  await supabase
    .from("centre_onboarding_steps")
    .update({ status: "in_progress" })
    .eq("checklist_id", checklist.id)
    .eq("step_number", 3);

  // Queue lifecycle welcome email (separate from the per-step row).
  // The cron handles both queues; either path delivering the welcome
  // is fine. Idempotent.
  await queueOnboardingEmail(checklist.id, ONBOARDING_EMAIL_KEYS.welcome);

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
      .order("sent_at", { ascending: false, nullsFirst: true }),
  ]);

  return {
    checklist: checklist as CentreOnboardingChecklist,
    steps: (stepsRes.data as CentreOnboardingStep[]) ?? [],
    emails: (emailsRes.data as CentreOnboardingEmail[]) ?? [],
  };
}

/**
 * Get every onboarding row for the ops list view — both in-flight and
 * recently completed. Provides everything the list needs to render
 * grid cards (next step + due date + region) without extra round-trips.
 *
 * Filters:
 *   - `includeCompleted`: when true, also returns rows whose
 *     `status='completed'` AND `completed_at` is within the last 30
 *     days. Useful for "completed this week" pulse jump-links.
 */
export async function getOnboardingListItems({
  includeCompleted = true,
}: { includeCompleted?: boolean } = {}): Promise<
  Array<{
    id: string;
    centreId: string;
    centreName: string;
    status: "in_progress" | "completed" | "stalled";
    startedAt: string;
    completedAt: string | null;
    completedSteps: number;
    totalSteps: number;
    daysSinceStart: number;
    nextStepLabel: string | null;
    nextStepDueAt: string | null;
    regionId: string | null;
    regionName: string | null;
  }>
> {
  const supabase = await createSupabaseServerClient();

  // Pull every onboarding row we want to render. Joining the centre
  // gives us name + region in one round-trip.
  const thirtyDaysAgoIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from("centre_onboarding_checklists")
    .select(
      "*, centres:centre_id(id, name, region_id, regions:region_id(name))",
    )
    .order("started_at", { ascending: false });

  if (!includeCompleted) {
    query = query.eq("status", "in_progress");
  } else {
    // Either in_progress OR completed within the last 30 days. We
    // can't express OR cleanly with .eq+.gte, so we filter in JS
    // below after pulling everything.
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  const checklistIds = rows.map((r: Record<string, unknown>) => r.id as string);

  // One query, all steps for these checklists. Avoids a per-row loop.
  const { data: stepRows } = await supabase
    .from("centre_onboarding_steps")
    .select("checklist_id, step_number, step_name, status, scheduled_for")
    .in("checklist_id", checklistIds)
    .order("step_number", { ascending: true });

  // Group steps by checklist for fast lookup.
  const stepsByChecklist = new Map<
    string,
    Array<{
      step_number: number;
      step_name: string;
      status: string;
      scheduled_for: string | null;
    }>
  >();
  for (const s of (stepRows ?? []) as Array<{
    checklist_id: string;
    step_number: number;
    step_name: string;
    status: string;
    scheduled_for: string | null;
  }>) {
    if (!stepsByChecklist.has(s.checklist_id)) {
      stepsByChecklist.set(s.checklist_id, []);
    }
    stepsByChecklist.get(s.checklist_id)!.push({
      step_number: s.step_number,
      step_name: s.step_name,
      status: s.status,
      scheduled_for: s.scheduled_for,
    });
  }

  const out = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const status = row.status as "in_progress" | "completed" | "stalled";
    const completedAt = (row.completed_at as string | null) ?? null;

    // Skip stale completed rows — keep the list focused on what ops
    // can act on. The "completed this week" jump-link still hits the
    // recent ones.
    if (
      includeCompleted &&
      status === "completed" &&
      completedAt &&
      completedAt < thirtyDaysAgoIso
    ) {
      continue;
    }

    const centre = row.centres as unknown as
      | {
          id: string;
          name: string;
          region_id: string | null;
          regions: { name: string } | null;
        }
      | null;
    if (!centre) continue;

    const steps = stepsByChecklist.get(row.id as string) ?? [];
    const completedSteps = steps.filter(
      (s) => s.status === "completed" || s.status === "skipped",
    ).length;

    // Next step = lowest step_number that isn't terminal.
    const nextStep = steps.find(
      (s) => s.status !== "completed" && s.status !== "skipped",
    );

    const startedAt = row.started_at as string;
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24),
    );

    out.push({
      id: row.id as string,
      centreId: centre.id,
      centreName: centre.name,
      status,
      startedAt,
      completedAt,
      completedSteps,
      totalSteps: TOTAL_STEPS,
      daysSinceStart,
      nextStepLabel: nextStep ? nextStep.step_name : null,
      nextStepDueAt: nextStep?.scheduled_for ?? null,
      regionId: centre.region_id,
      regionName: centre.regions?.name ?? null,
    });
  }

  return out;
}

/**
 * Get all active onboarding checklists for the legacy ops widget.
 * Kept for backward compatibility with any caller that still uses the
 * `ActiveOnboardingsWidget` shape.
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

    const centre = (row as Record<string, unknown>).centres as {
      id: string;
      name: string;
    };

    results.push({
      checklist: row as unknown as CentreOnboardingChecklist,
      centre,
      completedSteps,
      totalSteps: TOTAL_STEPS,
      daysSinceStart,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// STEP ACTIONS
// ─────────────────────────────────────────────

/**
 * Complete an onboarding step. Admin/ops only.
 *
 * If the completed step brings the checklist to the halfway mark
 * (5 of 10 done) it queues the halfway check-in email. If it
 * completes the last step it transitions the checklist to status
 * "completed" and queues the celebration email.
 */
export async function completeOnboardingStep(
  stepId: string,
  notes?: string
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrOps();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("centre_onboarding_steps")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: auth.user.id,
      notes: notes || null,
    })
    .eq("id", stepId);

  if (error) return { error: error.message };

  // Get checklist + step context to drive cascade triggers.
  const { data: step } = await supabase
    .from("centre_onboarding_steps")
    .select("checklist_id, step_number")
    .eq("id", stepId)
    .single();

  if (step) {
    await supabase.from("activity_log").insert({
      user_id: auth.user.id,
      action: "centre_onboarding_step_completed",
      entity_type: "centre_onboarding_step",
      entity_id: stepId,
      metadata: {
        step_number: step.step_number,
        checklist_id: step.checklist_id,
      },
    });

    await runStepCompletionCascades(step.checklist_id, step.step_number);
  }

  revalidatePath("/admin/centres");
  revalidatePath("/ops/onboarding");
  return { success: true };
}

/**
 * Skip an onboarding step with a reason. Admin/ops only.
 *
 * "Skipped" counts as a terminal state for progress purposes, so the
 * same halfway / completion cascades fire here too.
 */
export async function skipOnboardingStep(
  stepId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrOps();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("centre_onboarding_steps")
    .update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      completed_by: auth.user.id,
      notes: reason,
    })
    .eq("id", stepId);

  if (error) return { error: error.message };

  const { data: step } = await supabase
    .from("centre_onboarding_steps")
    .select("checklist_id, step_number")
    .eq("id", stepId)
    .single();

  if (step) {
    await supabase.from("activity_log").insert({
      user_id: auth.user.id,
      action: "centre_onboarding_step_skipped",
      entity_type: "centre_onboarding_step",
      entity_id: stepId,
      metadata: {
        step_number: step.step_number,
        checklist_id: step.checklist_id,
      },
    });

    await runStepCompletionCascades(step.checklist_id, step.step_number);
  }

  revalidatePath("/admin/centres");
  revalidatePath("/ops/onboarding");
  return { success: true };
}

/**
 * Revert a step back to "pending". Admin/ops only. If the parent
 * checklist had transitioned to "completed", reopen it.
 *
 * Useful when ops accidentally ticks the wrong step, or when an
 * external prerequisite (e.g. the contact list) is withdrawn.
 */
export async function revertOnboardingStep(
  stepId: string
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrOps();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data: step } = await supabase
    .from("centre_onboarding_steps")
    .select("checklist_id, step_number")
    .eq("id", stepId)
    .single();

  if (!step) return { error: "Step not found." };

  const { error } = await supabase
    .from("centre_onboarding_steps")
    .update({
      status: "pending",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", stepId);

  if (error) return { error: error.message };

  // If the checklist was already marked complete, reopen it.
  await supabase
    .from("centre_onboarding_checklists")
    .update({ status: "in_progress", completed_at: null })
    .eq("id", step.checklist_id)
    .eq("status", "completed");

  await supabase.from("activity_log").insert({
    user_id: auth.user.id,
    action: "centre_onboarding_step_reverted",
    entity_type: "centre_onboarding_step",
    entity_id: stepId,
    metadata: {
      step_number: step.step_number,
      checklist_id: step.checklist_id,
    },
  });

  revalidatePath("/admin/centres");
  revalidatePath("/ops/onboarding");
  return { success: true };
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

/**
 * Fan-out triggers fired after a step transitions to completed/skipped:
 *
 *  - Halfway check-in email when 5 of 10 steps are done (one-time).
 *  - Completion celebration email + checklist status flip when the
 *    last step lands.
 *  - First-session-prep is wired here too: when step 7 ("Schedule
 *    first session") completes, we queue the lifecycle prep email so
 *    the centre gets a heads-up even before the cron's per-step
 *    handler for step 9 fires.
 */
async function runStepCompletionCascades(
  checklistId: string,
  stepNumber: number
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  if (stepNumber === 7) {
    // First session scheduled — queue prep email immediately. The
    // queue is idempotent, so this is safe to run multiple times.
    await queueOnboardingEmail(
      checklistId,
      ONBOARDING_EMAIL_KEYS.firstSessionPrep
    );
  }

  const { data: steps } = await supabase
    .from("centre_onboarding_steps")
    .select("status")
    .eq("checklist_id", checklistId);

  if (!steps) return;

  const doneCount = steps.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;

  if (doneCount >= 5 && doneCount < TOTAL_STEPS) {
    // Halfway check-in. Idempotent insert handles double-fires.
    await queueOnboardingEmail(
      checklistId,
      ONBOARDING_EMAIL_KEYS.halfwayCheckIn
    );
  }

  if (doneCount >= TOTAL_STEPS) {
    await supabase
      .from("centre_onboarding_checklists")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", checklistId);

    await queueOnboardingEmail(
      checklistId,
      ONBOARDING_EMAIL_KEYS.completionCelebration
    );
  }
}
