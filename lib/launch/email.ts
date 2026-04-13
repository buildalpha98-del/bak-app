"use server";

// ============================================================
// Launch Foundation — Email utility with logging
// Wraps the existing Resend client and logs every send to email_log.
//
// Two ways to use:
// 1. sendEmail({ to, subject, html, emailType }) — direct send + log
// 2. sendTemplatedEmail({ to, template, data }) — render template then send + log
//
// Templates live in lib/launch/email-templates.ts
// ============================================================

import { sendEmail as resendSendEmail } from "@/lib/email/send";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { EmailTemplate } from "./types";
import * as templates from "./email-templates";

// ========================
// sendEmail — send + log to email_log
// ========================

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  recipientId?: string;
  emailType: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const { to, subject, html, recipientId, emailType, metadata = {} } = params;

  // Send via Resend
  const result = await resendSendEmail(to, subject, html);

  // Log to email_log (using admin client to bypass RLS)
  const supabase = createSupabaseAdmin();
  await supabase.from("email_log").insert({
    recipient_email: to,
    recipient_id: recipientId || null,
    email_type: emailType,
    subject,
    status: result.success ? "sent" : "failed",
    metadata: { ...metadata, error: result.error || null },
  });

  return result;
}

// ========================
// sendTemplatedEmail — render from template functions then send + log
// ========================

export async function sendTemplatedEmail(params: {
  to: string;
  recipientId?: string;
  template: EmailTemplate;
  data: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const { to, recipientId, template, data } = params;
  const { subject, html } = renderTemplate(template, data);

  return sendEmail({
    to,
    subject,
    html,
    recipientId,
    emailType: template,
    metadata: { template, ...data },
  });
}

// ========================
// Template router — delegates to email-templates.ts functions
// ========================

function renderTemplate(
  template: EmailTemplate,
  data: Record<string, unknown>
): { subject: string; html: string } {
  switch (template) {
    case "welcome_parent":
      return templates.welcomeParent(data as Parameters<typeof templates.welcomeParent>[0]);
    case "welcome_coach":
      return templates.welcomeCoach(data as Parameters<typeof templates.welcomeCoach>[0]);
    case "welcome_centre":
      return templates.welcomeCentre(data as Parameters<typeof templates.welcomeCentre>[0]);
    case "booking_confirmation":
      return templates.bookingConfirmation(data as Parameters<typeof templates.bookingConfirmation>[0]);
    case "booking_cancellation":
      return templates.bookingCancellation(data as Parameters<typeof templates.bookingCancellation>[0]);
    case "payment_receipt":
      return templates.paymentReceipt(data as Parameters<typeof templates.paymentReceipt>[0]);
    case "package_confirmation":
      return templates.packageConfirmation(data as Parameters<typeof templates.packageConfirmation>[0]);
    case "session_reminder_parent":
      return templates.sessionReminderParent(data as Parameters<typeof templates.sessionReminderParent>[0]);
    case "session_reminder_coach":
      return templates.sessionReminderCoach(data as Parameters<typeof templates.sessionReminderCoach>[0]);
    case "roster_assignment":
      return templates.rosterAssignment(data as Parameters<typeof templates.rosterAssignment>[0]);
    case "roster_change":
      return templates.rosterChange(data as Parameters<typeof templates.rosterChange>[0]);
    case "weekly_schedule":
      return templates.weeklySchedule(data as Parameters<typeof templates.weeklySchedule>[0]);
    case "feedback_request":
      return templates.feedbackRequest(data as Parameters<typeof templates.feedbackRequest>[0]);
    case "invoice_ready":
      return templates.invoiceReady(data as Parameters<typeof templates.invoiceReady>[0]);
    case "invitation":
      return templates.invitation(data as Parameters<typeof templates.invitation>[0]);
    default: {
      const _exhaustive: never = template;
      return { subject: "Build Alpha Kids", html: "" };
    }
  }
}
