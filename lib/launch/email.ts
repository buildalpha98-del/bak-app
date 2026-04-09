"use server";

// ============================================================
// Launch Foundation — Email utility with logging
// Wraps the existing Resend client and logs every send to email_log
// ============================================================

import { sendEmail as resendSendEmail } from "@/lib/email/send";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { EmailTemplate } from "./types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.buildalphakids.com.au";
const FROM_EMAIL_ADDRESS = process.env.BAK_FROM_EMAIL || "noreply@buildalphakids.com.au";

// ========================
// sendEmail — send + log
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
// sendTemplatedEmail — render template then send
// ========================
export async function sendTemplatedEmail(params: {
  to: string;
  recipientId?: string;
  template: EmailTemplate;
  data: Record<string, string>;
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
// Template renderer
// ========================

const BRAND_ORANGE = "#E8712A";
const BRAND_DARK = "#1A1A1A";
const BRAND_GREY = "#666666";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:${BRAND_ORANGE};padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">Build Alpha Kids</h1>
        </td></tr>
        <tr><td style="padding:24px;color:${BRAND_DARK};font-size:14px;line-height:1.6;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E5E5;color:${BRAND_GREY};font-size:12px;text-align:center;">
          Build Alpha Kids &bull; Multi-Sport Coaching<br>
          <a href="${APP_URL}" style="color:${BRAND_ORANGE};text-decoration:none;">Open App</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function cta(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">${label}</a>`;
}

function renderTemplate(
  template: EmailTemplate,
  data: Record<string, string>
): { subject: string; html: string } {
  switch (template) {
    case "welcome_parent":
      return {
        subject: "Welcome to Build Alpha Kids!",
        html: layout(`
          <p>Hi ${data.name},</p>
          <p>Welcome to <strong>Build Alpha Kids</strong>! We're excited to have you and your family on board.</p>
          <p>You can now browse sessions, book activities, and track your children's progress.</p>
          ${cta("Get Started", `${APP_URL}/parent`)}
        `),
      };

    case "welcome_coach":
      return {
        subject: "Welcome to the Build Alpha Kids team!",
        html: layout(`
          <p>Hi ${data.name},</p>
          <p>Welcome to the <strong>Build Alpha Kids</strong> coaching team! Your account is ready.</p>
          <p>Log in to view your schedule, access training modules, and manage sessions.</p>
          ${cta("View Dashboard", `${APP_URL}/coach`)}
        `),
      };

    case "welcome_centre":
      return {
        subject: `Welcome to Build Alpha Kids — ${data.centreName}`,
        html: layout(`
          <p>Hi ${data.name},</p>
          <p>Welcome to <strong>Build Alpha Kids</strong>! We're thrilled to be partnering with <strong>${data.centreName}</strong>.</p>
          <p>Your Client Portal is ready — view schedules, reports, and child progress.</p>
          ${cta("Access Portal", `${APP_URL}/client/${data.centreId}`)}
        `),
      };

    case "booking_confirmation":
      return {
        subject: `Booking Confirmed — ${data.sessionName}`,
        html: layout(`
          <p>Hi ${data.parentName},</p>
          <p>Your booking for <strong>${data.childName}</strong> has been confirmed:</p>
          <table role="presentation" style="margin:16px 0;width:100%;">
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:100px;">Session</td><td style="padding:4px 8px;font-weight:600;">${data.sessionName}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Date</td><td style="padding:4px 8px;font-weight:600;">${data.date}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Time</td><td style="padding:4px 8px;font-weight:600;">${data.time}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Location</td><td style="padding:4px 8px;font-weight:600;">${data.location}</td></tr>
          </table>
          ${cta("View Booking", `${APP_URL}/parent/bookings`)}
        `),
      };

    case "booking_cancellation":
      return {
        subject: `Booking Cancelled — ${data.sessionName}`,
        html: layout(`
          <p>Hi ${data.parentName},</p>
          <p>Your booking for <strong>${data.childName}</strong> at <strong>${data.sessionName}</strong> on <strong>${data.date}</strong> has been cancelled.</p>
          ${data.refundNote ? `<p>${data.refundNote}</p>` : ""}
          ${cta("Browse Sessions", `${APP_URL}/parent/sessions`)}
        `),
      };

    case "payment_receipt":
      return {
        subject: `Payment Receipt — $${data.amount}`,
        html: layout(`
          <p>Hi ${data.parentName},</p>
          <p>We've received your payment of <strong>$${data.amount}</strong>.</p>
          <table role="presentation" style="margin:16px 0;width:100%;">
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:120px;">Description</td><td style="padding:4px 8px;font-weight:600;">${data.description}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Amount</td><td style="padding:4px 8px;font-weight:600;">$${data.amount}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Date</td><td style="padding:4px 8px;font-weight:600;">${data.date}</td></tr>
          </table>
          ${cta("View Payments", `${APP_URL}/parent/payments`)}
        `),
      };

    case "package_confirmation":
      return {
        subject: `Package Purchased — ${data.packageName}`,
        html: layout(`
          <p>Hi ${data.parentName},</p>
          <p>Your <strong>${data.packageName}</strong> package has been activated with <strong>${data.sessions} sessions</strong>.</p>
          <p>You can now book sessions using your package credits.</p>
          ${cta("Book a Session", `${APP_URL}/parent/sessions`)}
        `),
      };

    case "session_reminder_parent":
      return {
        subject: `Reminder: ${data.childName}'s session tomorrow`,
        html: layout(`
          <p>Hi ${data.parentName},</p>
          <p>Just a reminder that <strong>${data.childName}</strong> has a session tomorrow:</p>
          <table role="presentation" style="margin:16px 0;width:100%;">
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:100px;">Session</td><td style="padding:4px 8px;font-weight:600;">${data.sessionName}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Time</td><td style="padding:4px 8px;font-weight:600;">${data.time}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Location</td><td style="padding:4px 8px;font-weight:600;">${data.location}</td></tr>
          </table>
          ${cta("View Details", `${APP_URL}/parent/bookings`)}
        `),
      };

    case "session_reminder_coach":
      return {
        subject: `Reminder: Session tomorrow at ${data.location}`,
        html: layout(`
          <p>Hi ${data.coachName},</p>
          <p>You have a session tomorrow:</p>
          <table role="presentation" style="margin:16px 0;width:100%;">
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:100px;">Sport</td><td style="padding:4px 8px;font-weight:600;">${data.sport}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Location</td><td style="padding:4px 8px;font-weight:600;">${data.location}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Time</td><td style="padding:4px 8px;font-weight:600;">${data.time}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Children</td><td style="padding:4px 8px;font-weight:600;">${data.childCount}</td></tr>
          </table>
          ${cta("View Schedule", `${APP_URL}/coach/schedule`)}
        `),
      };

    case "roster_assignment":
      return {
        subject: `New Roster Assignment — ${data.sport} at ${data.location}`,
        html: layout(`
          <p>Hi ${data.coachName},</p>
          <p>You've been assigned a new session:</p>
          <table role="presentation" style="margin:16px 0;width:100%;">
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:100px;">Sport</td><td style="padding:4px 8px;font-weight:600;">${data.sport}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Location</td><td style="padding:4px 8px;font-weight:600;">${data.location}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Date</td><td style="padding:4px 8px;font-weight:600;">${data.date}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Time</td><td style="padding:4px 8px;font-weight:600;">${data.time}</td></tr>
          </table>
          ${cta("View Roster", `${APP_URL}/coach/schedule`)}
        `),
      };

    case "roster_change":
      return {
        subject: `Roster Update — ${data.date}`,
        html: layout(`
          <p>Hi ${data.coachName},</p>
          <p>There's been a change to your roster on <strong>${data.date}</strong>:</p>
          <p>${data.changeDescription}</p>
          ${cta("View Updated Roster", `${APP_URL}/coach/schedule`)}
        `),
      };

    case "weekly_schedule":
      return {
        subject: `Your Week Ahead — ${data.weekStart}`,
        html: layout(`
          <p>Hi ${data.coachName},</p>
          <p>Here's your schedule for the week of <strong>${data.weekStart}</strong>:</p>
          <p><strong>${data.sessionCount} sessions</strong> across <strong>${data.locationCount} locations</strong></p>
          ${cta("View Full Schedule", `${APP_URL}/coach/schedule`)}
        `),
      };

    case "feedback_request":
      return {
        subject: `How was today's ${data.sport} session? — Build Alpha Kids`,
        html: layout(`
          <p>Hi ${data.contactName},</p>
          <p><strong>${data.coachName}</strong> delivered a <strong>${data.sport}</strong> session on <strong>${data.date}</strong>. We'd love your quick feedback:</p>
          ${cta("Rate This Session", `${APP_URL}/feedback/${data.feedbackId}`)}
        `),
      };

    case "invoice_ready":
      return {
        subject: `Invoice ${data.invoiceNumber} — Build Alpha Kids`,
        html: layout(`
          <p>Hi ${data.contactName},</p>
          <p>Your invoice <strong>${data.invoiceNumber}</strong> for <strong>$${data.total}</strong> is ready.</p>
          <p>Due date: <strong>${data.dueDate}</strong></p>
          ${cta("View Invoice", `${APP_URL}/client/${data.centreId}/invoices`)}
        `),
      };

    case "invitation":
      return {
        subject: "You're invited to Build Alpha Kids",
        html: layout(`
          <p>Hi ${data.name},</p>
          <p>You've been invited to join <strong>Build Alpha Kids</strong> as a <strong>${data.role}</strong>.</p>
          <p>Click below to accept and set up your account:</p>
          ${cta("Accept Invitation", `${APP_URL}/auth/accept-invite?token=${data.invitationId}`)}
          <p style="color:${BRAND_GREY};font-size:13px;margin-top:16px;">This invitation expires in 30 days.</p>
        `),
      };

    default: {
      const _exhaustive: never = template;
      return {
        subject: "Build Alpha Kids",
        html: layout(`<p>You have a new notification from Build Alpha Kids.</p>`),
      };
    }
  }
}
