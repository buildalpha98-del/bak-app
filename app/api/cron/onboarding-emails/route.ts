import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import {
  onboardingWelcomeEmail,
  onboardingChildListRequestEmail,
  onboardingSessionPrepEmail,
  onboardingFollowUpEmail,
} from "@/lib/email/templates";

export const dynamic = "force-dynamic";

/**
 * Onboarding emails cron — runs hourly.
 * Processes scheduled onboarding steps (auto_email type) that are due.
 *
 * Step 3: Welcome email (triggered immediately on start)
 * Step 4: Child list request (scheduled for 2 days after start)
 * Step 9: First session prep email (scheduled when first session is created)
 * Step 10: Post first-session follow-up (scheduled 1 day after first session)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdmin();
    const now = new Date().toISOString();
    let sent = 0;
    let skipped = 0;

    // Find all auto_email steps that are in_progress or pending with a due scheduled_for
    const { data: dueSteps, error: stepsError } = await admin
      .from("centre_onboarding_steps")
      .select("*, centre_onboarding_checklists!inner(centre_id, status)")
      .eq("step_type", "auto_email")
      .in("status", ["pending", "in_progress"])
      .lte("scheduled_for", now);

    if (stepsError) throw stepsError;
    if (!dueSteps || dueSteps.length === 0) {
      // Also check for step 3 (welcome) that is in_progress but has no scheduled_for
      const { data: welcomeSteps } = await admin
        .from("centre_onboarding_steps")
        .select("*, centre_onboarding_checklists!inner(centre_id, status)")
        .eq("step_type", "auto_email")
        .eq("step_number", 3)
        .eq("status", "in_progress");

      if (!welcomeSteps || welcomeSteps.length === 0) {
        return NextResponse.json({ sent: 0, skipped: 0 });
      }

      // Process welcome emails
      for (const step of welcomeSteps) {
        const result = await processStep(admin, step);
        if (result === "sent") sent++;
        else skipped++;
      }

      return NextResponse.json({ sent, skipped });
    }

    for (const step of dueSteps) {
      const result = await processStep(admin, step);
      if (result === "sent") sent++;
      else skipped++;
    }

    // Check for stalled onboardings (no progress in 14+ days)
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    await admin
      .from("centre_onboarding_checklists")
      .update({ status: "stalled" })
      .eq("status", "in_progress")
      .lt("started_at", fourteenDaysAgo);

    return NextResponse.json({ sent, skipped });
  } catch (err) {
    console.error("Onboarding emails cron error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

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
): Promise<"sent" | "skipped"> {
  const centreId = step.centre_onboarding_checklists.centre_id;

  // Get centre details
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
    .select("id")
    .eq("checklist_id", step.checklist_id)
    .eq("step_number", step.step_number)
    .maybeSingle();

  if (existingEmail) {
    // Already sent — mark step as completed
    await admin
      .from("centre_onboarding_steps")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", step.id);
    return "skipped";
  }

  let emailData: { subject: string; html: string } | null = null;

  switch (step.step_number) {
    case 3: // Welcome email
      emailData = onboardingWelcomeEmail(centre.name || "Your Centre", contactName);
      break;

    case 4: // Child list request
      emailData = onboardingChildListRequestEmail(
        centre.name || "Your Centre",
        contactName
      );
      break;

    case 9: {
      // Session prep email — needs first session details
      const { data: firstSession } = await admin
        .from("sessions")
        .select("date, sport, profiles!sessions_coach_id_fkey(name)")
        .eq("centre_id", centreId)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstSession) return "skipped";

      const coachProfile = firstSession.profiles as unknown as { name: string } | null;
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
      // Post first-session follow-up
      const feedbackUrl = `https://app.buildalphakids.com.au/feedback/centre/${centreId}`;
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
    // Record the email
    await admin.from("centre_onboarding_emails").insert({
      checklist_id: step.checklist_id,
      step_number: step.step_number,
      email_type: step.step_name,
      sent_to: centre.contact_email,
    });

    // Mark step as completed
    await admin
      .from("centre_onboarding_steps")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", step.id);

    return "sent";
  }

  return "skipped";
}
