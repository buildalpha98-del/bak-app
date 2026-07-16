import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import {
  onboardingWelcomeEmail,
  onboardingChildListRequestEmail,
  onboardingSessionPrepEmail,
  onboardingFollowUpEmail,
  onboardingDocsReminderEmail,
  onboardingHalfwayCheckInEmail,
  onboardingCompletionCelebrationEmail,
} from "@/lib/email/templates";
import {
  ONBOARDING_EMAIL_KEYS as LIFECYCLE_EMAIL_KEYS,
  type OnboardingEmailKey as LifecycleKey,
} from "@/lib/onboarding/constants";
import { getBaseUrl } from "@/lib/utils/base-url";

export const dynamic = "force-dynamic";

// 48 hours since checklist started — when we nudge ops to chase the
// centre profile + docs if nothing's landed yet.
const DOCS_REMINDER_THRESHOLD_MS = 48 * 60 * 60 * 1000;

const LIFECYCLE_KEY_SET = new Set<string>(Object.values(LIFECYCLE_EMAIL_KEYS));

/**
 * Onboarding emails cron — runs every 2 hours (see vercel.json).
 *
 * Drives three queues per run:
 *  1. Per-step auto_email rows whose `scheduled_for` has passed
 *     (the legacy per-step path; steps 3/4/9/10).
 *  2. Lifecycle queue rows (sent_at IS NULL, lifecycle email_type)
 *     inserted by `queueOnboardingEmail` from action triggers.
 *  3. 48h docs reminder: in-progress checklists older than 48h whose
 *     step 1 ("Complete centre profile") is still pending get a
 *     docs_reminder lifecycle row enqueued, which the same run picks
 *     up and dispatches.
 *
 * Finally, in-progress checklists older than 14 days are flipped to
 * "stalled" so they show up in ops triage.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdmin();
    const now = new Date();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // ── Per-step queue (legacy path) ──────────────────────────────
    const { data: dueSteps, error: stepsError } = await admin
      .from("centre_onboarding_steps")
      .select("*, centre_onboarding_checklists!inner(centre_id, status)")
      .eq("step_type", "auto_email")
      .in("status", ["pending", "in_progress"])
      .lte("scheduled_for", now.toISOString());

    if (stepsError) throw stepsError;

    for (const step of dueSteps ?? []) {
      const outcome = await processStep(admin, step as StepRow);
      if (outcome === "sent") sent++;
      else if (outcome === "failed") failed++;
      else skipped++;
    }

    // Step 3 (welcome) is started as `in_progress` with no
    // scheduled_for, so the .lte filter above won't catch it. Pick it
    // up here.
    const { data: welcomeSteps } = await admin
      .from("centre_onboarding_steps")
      .select("*, centre_onboarding_checklists!inner(centre_id, status)")
      .eq("step_type", "auto_email")
      .eq("step_number", 3)
      .eq("status", "in_progress")
      .is("scheduled_for", null);

    for (const step of welcomeSteps ?? []) {
      const outcome = await processStep(admin, step as StepRow);
      if (outcome === "sent") sent++;
      else if (outcome === "failed") failed++;
      else skipped++;
    }

    // ── 48h docs reminder enqueue ─────────────────────────────────
    // Find in-progress checklists started more than 48h ago whose
    // step 1 is still pending, then queue a docs_reminder if one
    // hasn't already been queued.
    const cutoffIso = new Date(
      now.getTime() - DOCS_REMINDER_THRESHOLD_MS
    ).toISOString();

    const { data: agedChecklists } = await admin
      .from("centre_onboarding_checklists")
      .select("id, centre_id, started_at")
      .eq("status", "in_progress")
      .lt("started_at", cutoffIso);

    for (const checklist of agedChecklists ?? []) {
      const { data: docsStep } = await admin
        .from("centre_onboarding_steps")
        .select("status")
        .eq("checklist_id", checklist.id)
        .eq("step_number", 1)
        .maybeSingle();

      if (!docsStep || docsStep.status !== "pending") continue;

      // Look up centre contact and enqueue. The unique index makes
      // this idempotent.
      const { data: centre } = await admin
        .from("centres")
        .select("contact_email")
        .eq("id", checklist.centre_id)
        .maybeSingle();

      if (!centre?.contact_email) continue;

      await admin
        .from("centre_onboarding_emails")
        .insert({
          checklist_id: checklist.id,
          step_number: 0,
          email_type: LIFECYCLE_EMAIL_KEYS.docsReminder,
          sent_to: centre.contact_email,
          sent_at: null,
        });
    }

    // ── Lifecycle queue dispatch ──────────────────────────────────
    // Read after enqueueing so the freshly-queued docs reminders get
    // sent in this same run.
    const { data: queued } = await admin
      .from("centre_onboarding_emails")
      .select(
        "id, checklist_id, email_type, sent_to, centre_onboarding_checklists!inner(centre_id)"
      )
      .is("sent_at", null)
      .is("error_text", null)
      .in("email_type", Array.from(LIFECYCLE_KEY_SET));

    for (const row of queued ?? []) {
      const outcome = await dispatchLifecycleEmail(
        admin,
        row as unknown as LifecycleRow
      );
      if (outcome === "sent") sent++;
      else if (outcome === "failed") failed++;
      else skipped++;
    }

    // ── Stalled-onboarding sweep ──────────────────────────────────
    const fourteenDaysAgo = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    await admin
      .from("centre_onboarding_checklists")
      .update({ status: "stalled" })
      .eq("status", "in_progress")
      .lt("started_at", fourteenDaysAgo);

    return NextResponse.json({ sent, skipped, failed });
  } catch (err) {
    console.error("Onboarding emails cron error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

// ============================================================
// Per-step auto_email handler (legacy: steps 3, 4, 9, 10)
// ============================================================

type StepRow = {
  id: string;
  checklist_id: string;
  step_number: number;
  step_name: string;
  status: string;
  centre_onboarding_checklists: {
    centre_id: string;
    status: string;
  };
};

async function processStep(
  admin: ReturnType<typeof createSupabaseAdmin>,
  step: StepRow
): Promise<"sent" | "skipped" | "failed"> {
  const centreId = step.centre_onboarding_checklists.centre_id;

  const { data: centre } = await admin
    .from("centres")
    .select("name, contact_name, contact_email")
    .eq("id", centreId)
    .single();

  if (!centre || !centre.contact_email) return "skipped";

  const contactName = centre.contact_name || centre.name || "there";

  // Check if email already sent for this step
  const { data: existingEmail } = await admin
    .from("centre_onboarding_emails")
    .select("id, sent_at")
    .eq("checklist_id", step.checklist_id)
    .eq("step_number", step.step_number)
    .maybeSingle();

  if (existingEmail?.sent_at) {
    // Already sent — mark step as completed and move on
    await admin
      .from("centre_onboarding_steps")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", step.id);
    return "skipped";
  }

  let emailData: { subject: string; html: string } | null = null;

  switch (step.step_number) {
    case 3:
      emailData = onboardingWelcomeEmail(centre.name || "Your Centre", contactName);
      break;

    case 4:
      emailData = onboardingChildListRequestEmail(
        centre.name || "Your Centre",
        contactName
      );
      break;

    case 9: {
      const { data: firstSession } = await admin
        .from("sessions")
        .select("date, sport, profiles!sessions_coach_id_fkey(name)")
        .eq("centre_id", centreId)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstSession) return "skipped";

      const coachProfile = firstSession.profiles as unknown as
        | { name: string }
        | null;
      emailData = onboardingSessionPrepEmail(
        centre.name || "Your Centre",
        contactName,
        new Date(firstSession.date).toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
        coachProfile?.name || "Your Coach",
        firstSession.sport || "Multi-Sport"
      );
      break;
    }

    case 10: {
      const feedbackUrl = `${getBaseUrl()}/feedback/centre/${centreId}`;
      emailData = onboardingFollowUpEmail(
        centre.name || "Your Centre",
        contactName,
        feedbackUrl
      );
      break;
    }

    default:
      return "skipped";
  }

  if (!emailData) return "skipped";

  const result = await sendEmail(
    centre.contact_email,
    emailData.subject,
    emailData.html
  );

  if (result.success) {
    await admin.from("centre_onboarding_emails").insert({
      checklist_id: step.checklist_id,
      step_number: step.step_number,
      email_type: step.step_name,
      sent_to: centre.contact_email,
      sent_at: new Date().toISOString(),
    });

    await admin
      .from("centre_onboarding_steps")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", step.id);

    return "sent";
  }

  // Record the failure so we don't hammer Resend on the next run.
  await admin.from("centre_onboarding_emails").insert({
    checklist_id: step.checklist_id,
    step_number: step.step_number,
    email_type: step.step_name,
    sent_to: centre.contact_email,
    sent_at: null,
    error_text: result.error ?? "send failed",
  });

  return "failed";
}

// ============================================================
// Lifecycle queue dispatcher (welcome, halfway, completion, etc.)
// ============================================================

type LifecycleRow = {
  id: string;
  checklist_id: string;
  email_type: LifecycleKey;
  sent_to: string;
  centre_onboarding_checklists: {
    centre_id: string;
  };
};

async function dispatchLifecycleEmail(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: LifecycleRow
): Promise<"sent" | "skipped" | "failed"> {
  if (!row.sent_to) return "skipped";

  const centreId = row.centre_onboarding_checklists.centre_id;
  const { data: centre } = await admin
    .from("centres")
    .select("name, contact_name")
    .eq("id", centreId)
    .single();

  if (!centre) return "skipped";

  const contactName = centre.contact_name || centre.name || "there";
  const centreName = centre.name || "Your Centre";

  let emailData: { subject: string; html: string } | null = null;
  switch (row.email_type) {
    case LIFECYCLE_EMAIL_KEYS.welcome:
      emailData = onboardingWelcomeEmail(centreName, contactName);
      break;
    case LIFECYCLE_EMAIL_KEYS.docsReminder:
      emailData = onboardingDocsReminderEmail(centreName, contactName);
      break;
    case LIFECYCLE_EMAIL_KEYS.firstSessionPrep: {
      const { data: firstSession } = await admin
        .from("sessions")
        .select("date, sport, profiles!sessions_coach_id_fkey(name)")
        .eq("centre_id", centreId)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstSession) return "skipped";

      const coachProfile = firstSession.profiles as unknown as
        | { name: string }
        | null;
      emailData = onboardingSessionPrepEmail(
        centreName,
        contactName,
        new Date(firstSession.date).toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
        coachProfile?.name || "Your Coach",
        firstSession.sport || "Multi-Sport"
      );
      break;
    }
    case LIFECYCLE_EMAIL_KEYS.halfwayCheckIn:
      emailData = onboardingHalfwayCheckInEmail(centreName, contactName);
      break;
    case LIFECYCLE_EMAIL_KEYS.completionCelebration:
      emailData = onboardingCompletionCelebrationEmail(centreName, contactName);
      break;
    default:
      return "skipped";
  }

  if (!emailData) return "skipped";

  const result = await sendEmail(
    row.sent_to,
    emailData.subject,
    emailData.html
  );

  if (result.success) {
    await admin
      .from("centre_onboarding_emails")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id);
    return "sent";
  }

  await admin
    .from("centre_onboarding_emails")
    .update({ error_text: result.error ?? "send failed" })
    .eq("id", row.id);
  return "failed";
}
