// ============================================================
// Launch Foundation — Email template functions
// Each function takes typed data and returns { subject, html }
// Uses inline CSS, BAK branding, mobile-friendly layout
// ============================================================
//
// AUDIENCE SPLIT (see the marketing-site plan's audience principle):
// parents live on the marketing origin (buildalphakids.com.au), staff and
// centres-as-clients live on the app domain (buildalphakids.app). This
// module serves BOTH, so it must never share one origin constant —
// every template declares its audience and links accordingly.

import { getBaseUrl, getMarketingUrl } from "@/lib/utils/base-url";

type Audience = "parent" | "staff";

/** Parents -> the consumer brand; staff/centres -> the operational app. */
function originFor(audience: Audience): string {
  return audience === "parent" ? getMarketingUrl() : getBaseUrl();
}

const BRAND_ORANGE = "#E8712A";
const BRAND_WARM_BG = "#FFF7ED";
const BRAND_DARK = "#1A1A1A";
const BRAND_GREY = "#666666";

// ========================
// Shared layout
// ========================

function layout(content: string, audience: Audience): string {
  const origin = originFor(audience);
  const logoUrl = `${origin}/logo.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${BRAND_WARM_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_WARM_BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:${BRAND_ORANGE};padding:20px 24px;">
          <img src="${logoUrl}" alt="Build Alpha Kids" width="40" height="40" style="vertical-align:middle;margin-right:12px;" />
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;vertical-align:middle;">Build Alpha Kids</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px;color:${BRAND_DARK};font-size:14px;line-height:1.6;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid #F0E6DC;color:${BRAND_GREY};font-size:11px;text-align:center;">
          Build Alpha Kids Pty Ltd${process.env.BAK_ABN ? ` | ABN: ${process.env.BAK_ABN}` : ""}<br>
          Multi-Sport Coaching for Kids &bull; South-West Sydney<br>
          <a href="${origin}" style="color:${BRAND_ORANGE};text-decoration:none;">Open App</a><br>
          ${
            audience === "parent"
              ? `<span style="color:#999;">To manage your notification preferences, <a href="${origin}/parent/settings" style="color:#999;">visit your account settings</a>.</span>`
              : ""
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const parentLayout = (content: string): string => layout(content, "parent");
const staffLayout = (content: string): string => layout(content, "staff");

function cta(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;padding:14px 28px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">${label}</a>
  </div>`;
}

function detailRow(label: string, value: string): string {
  return `<tr><td style="padding:8px 12px;color:${BRAND_GREY};width:120px;background:#FAFAFA;">${label}</td><td style="padding:8px 12px;font-weight:600;">${value}</td></tr>`;
}

function detailTable(rows: string): string {
  return `<table role="presentation" style="margin:16px 0;width:100%;border:1px solid #F0F0F0;border-radius:6px;overflow:hidden;">${rows}</table>`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ========================
// a) Welcome Parent
// ========================

export function welcomeParent(data: {
  name: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  return {
    subject: "Welcome to Build Alpha Kids!",
    html: parentLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi ${data.name},</p>
      <p>Welcome to <strong>Build Alpha Kids</strong>! We're excited to have you and your family on board.</p>
      <p>From your parent portal you can:</p>
      <ul style="line-height:2;">
        <li>Browse and book sessions near you</li>
        <li>Manage your children's profiles</li>
        <li>Track upcoming and past bookings</li>
        <li>View your kids' progress and skills</li>
      </ul>
      ${cta("Go to Your Portal", `${origin}/parent`)}
      <p>We can't wait to see your kids in action!</p>
      <p style="color:${BRAND_GREY};font-size:13px;">&mdash; The Build Alpha Kids Team</p>
    `),
  };
}

// ========================
// b) Welcome Coach
// ========================

export function welcomeCoach(data: {
  name: string;
}): { subject: string; html: string } {
  const origin = originFor("staff");
  return {
    subject: "Welcome to the Build Alpha Kids team!",
    html: staffLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi ${data.name},</p>
      <p>Welcome to the <strong>Build Alpha Kids</strong> coaching team! Your account is now active.</p>
      <p>Here's what you'll find in your dashboard:</p>
      <ul style="line-height:2;">
        <li><strong>Schedule</strong> &mdash; view your upcoming sessions and confirm shifts</li>
        <li><strong>Session Workflow</strong> &mdash; mark attendance, upload photos, write notes</li>
        <li><strong>Training</strong> &mdash; complete required modules and grow your skills</li>
        <li><strong>Invoicing</strong> &mdash; generate and submit your invoices</li>
        <li><strong>AI Coach Assistant</strong> &mdash; get session plans and activity ideas</li>
      </ul>
      ${cta("View Your Dashboard", `${origin}/coach`)}
      <p>Looking forward to having you on the team!</p>
      <p style="color:${BRAND_GREY};font-size:13px;">&mdash; The Build Alpha Kids Team</p>
    `),
  };
}

// ========================
// a2) Parent Bulk Invite (magic link)
// Sent on bulk parent CSV import — the magic link IS the credential,
// so no password is included. Link expires after 1 hour (Supabase default).
// ========================

export function parentBulkInvite(data: {
  firstName: string;
  magicLinkUrl: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  return {
    subject: "You've been invited to Build Alpha Kids",
    html: parentLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi ${data.firstName},</p>
      <p>Welcome to <strong>Build Alpha Kids</strong>! We've set up your parent account so you can join the beta and start booking sport sessions for your kids.</p>
      <p>From your parent portal you can:</p>
      <ul style="line-height:2;">
        <li>Browse and book sport sessions near you</li>
        <li>Manage your children's profiles in one place</li>
        <li>Track upcoming bookings and past sessions</li>
        <li>See your kids' progress and skill assessments</li>
      </ul>
      <p>Tap the button below to sign in &mdash; no password needed.</p>
      ${cta("Sign In to Your Portal", data.magicLinkUrl)}
      <p style="color:${BRAND_GREY};font-size:13px;">This sign-in link expires in 1 hour. If it's expired by the time you tap it, just head to <a href="${origin}/parent-login" style="color:${BRAND_ORANGE};text-decoration:none;">${origin}/parent-login</a> and request a new one with the same email address.</p>
      <p style="color:${BRAND_GREY};font-size:13px;">If you weren't expecting this email, you can safely ignore it.</p>
      <p style="color:${BRAND_GREY};font-size:13px;">&mdash; The Build Alpha Kids Team</p>
    `),
  };
}

// ========================
// b2) Staff Onboarding (with credentials)
// Sent on createStaffMember — includes temporary password + login URL.
// ========================

export function staffOnboarding(data: {
  name: string;
  email: string;
  tempPassword: string;
  role: "admin" | "ops" | "coach";
}): { subject: string; html: string } {
  const origin = originFor("staff");
  const roleLabel =
    data.role === "admin" ? "Admin" : data.role === "ops" ? "Operations" : "Coach";
  const dashboardPath =
    data.role === "admin" ? "/admin" : data.role === "ops" ? "/ops" : "/coach";

  return {
    subject: `Welcome to Build Alpha Kids — your ${roleLabel} account is ready`,
    html: staffLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi ${data.name},</p>
      <p>Welcome to the <strong>Build Alpha Kids</strong> team. Your ${roleLabel} account is ready to use.</p>
      <p>Here are your login details:</p>
      ${detailTable(
        detailRow("Login URL", `<a href="${origin}/login" style="color:${BRAND_ORANGE};text-decoration:none;">${origin}/login</a>`) +
        detailRow("Email", data.email) +
        detailRow("Temporary password", `<code style="font-family:'SF Mono',Monaco,monospace;background:#F5F5F5;padding:2px 6px;border-radius:4px;">${data.tempPassword}</code>`)
      )}
      <p><strong>You will be prompted to set a new password on first login.</strong> Please choose something memorable and don't share it.</p>
      ${cta(`Open ${roleLabel} Dashboard`, `${origin}${dashboardPath}`)}
      <p>If you weren't expecting this email or didn't request an account, please reply to this email straight away.</p>
      <p style="color:${BRAND_GREY};font-size:13px;">&mdash; The Build Alpha Kids Team</p>
    `),
  };
}

// ========================
// c) Welcome Centre
// ========================

export function welcomeCentre(data: {
  name: string;
  centreName: string;
}): { subject: string; html: string } {
  const origin = originFor("staff");
  return {
    subject: `Welcome to Build Alpha Kids — ${data.centreName}`,
    html: staffLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi ${data.name},</p>
      <p>Welcome to <strong>Build Alpha Kids</strong>! We're thrilled to be partnering with <strong>${data.centreName}</strong>.</p>
      <p>Through your Client Portal you can:</p>
      <ul style="line-height:2;">
        <li>View upcoming session schedules</li>
        <li>Track attendance and child participation</li>
        <li>Access session reports and child progress updates</li>
        <li>View and download invoices</li>
        <li>Message the Build Alpha Kids team</li>
      </ul>
      ${cta("Access Your Portal", `${origin}/client`)}
      <p style="color:${BRAND_GREY};font-size:13px;">You'll receive a magic link each time you log in &mdash; no password needed.</p>
      <p style="color:${BRAND_GREY};font-size:13px;">&mdash; The Build Alpha Kids Team</p>
    `),
  };
}

// ========================
// d) Booking Confirmation
// ========================

export function bookingConfirmation(data: {
  parentName: string;
  childName: string;
  sessionName: string;
  date: string;
  time: string;
  location: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  return {
    subject: `Booking Confirmed — ${data.sessionName}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Booking Confirmed!</h2>
      <p>Hi ${data.parentName},</p>
      <p>Great news &mdash; your booking for <strong>${data.childName}</strong> has been confirmed.</p>

      ${detailTable(
        detailRow("Session", data.sessionName) +
        detailRow("Date", formatDate(data.date)) +
        detailRow("Time", data.time) +
        detailRow("Location", data.location)
      )}

      <div style="padding:12px;background:${BRAND_WARM_BG};border-radius:6px;border-left:3px solid ${BRAND_ORANGE};margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:600;">What to Bring:</p>
        <ul style="margin:0;padding-left:20px;">
          <li style="margin-bottom:4px;">Comfortable clothes and closed-toe shoes</li>
          <li style="margin-bottom:4px;">Water bottle</li>
          <li style="margin-bottom:4px;">Sun protection (hat, sunscreen)</li>
        </ul>
      </div>

      <p style="color:${BRAND_GREY};font-size:12px;">
        <strong>Cancellation Policy:</strong> Cancel more than 24 hours before the session for a full refund. Cancellations within 24 hours are not eligible for a refund.
      </p>

      ${cta("View My Bookings", `${origin}/parent/bookings`)}
    `),
  };
}

// ========================
// e) Booking Cancellation
// ========================

export function bookingCancellation(data: {
  parentName: string;
  childName: string;
  sessionName: string;
  date: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  return {
    subject: `Booking Cancelled — ${data.sessionName}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Booking Cancelled</h2>
      <p>Hi ${data.parentName},</p>
      <p>Your booking for <strong>${data.childName}</strong> at <strong>${data.sessionName}</strong> on <strong>${formatDate(data.date)}</strong> has been cancelled.</p>
      <p>If you'd like to book another session, browse available sessions in your parent portal.</p>
      ${cta("Browse Sessions", `${origin}/parent/book`)}
    `),
  };
}

// ========================
// f) Payment Receipt
// ========================

export function paymentReceipt(data: {
  parentName: string;
  amount: string;
  description: string;
  date: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  return {
    subject: `Payment Receipt — ${data.amount}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Payment Receipt</h2>
      <p>Hi ${data.parentName},</p>
      <p>We've received your payment. Here are the details:</p>

      ${detailTable(
        detailRow("Description", data.description) +
        detailRow("Amount", `<span style="color:${BRAND_ORANGE};font-weight:700;">${data.amount}</span>`) +
        detailRow("Date", formatDate(data.date))
      )}

      ${cta("View Payments", `${origin}/parent/payments`)}
    `),
  };
}

// ========================
// g) Package Confirmation
// ========================

export function packageConfirmation(data: {
  parentName: string;
  packageName: string;
  sessions: number;
  amount: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  return {
    subject: `Session Pack Purchased — ${data.packageName}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Session Pack Purchased!</h2>
      <p>Hi ${data.parentName},</p>
      <p>Thanks for your purchase! Your session pack is ready to use.</p>

      ${detailTable(
        detailRow("Pack", data.packageName) +
        detailRow("Sessions", `<span style="color:${BRAND_ORANGE};font-weight:700;">${data.sessions}</span>`) +
        detailRow("Amount Paid", data.amount)
      )}

      <p>You can use your pack sessions when booking any eligible session. Just select "Use Session Pack" at checkout.</p>

      ${cta("Browse Sessions", `${origin}/parent/book`)}
    `),
  };
}

// ========================
// h) Session Reminder (Parent)
// ========================

export function sessionReminderParent(data: {
  parentName: string;
  childName: string;
  sessionName: string;
  date: string;
  time: string;
  location: string;
  whatToBring?: string;
}): { subject: string; html: string } {
  const origin = originFor("parent");
  const bringSection = data.whatToBring
    ? `<p style="font-weight:600;">What to Bring:</p><p>${data.whatToBring}</p>`
    : `<p>Remember to bring comfortable clothes, a water bottle, and sun protection.</p>`;

  return {
    subject: `Reminder: ${data.childName}'s session tomorrow`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Session Tomorrow!</h2>
      <p>Hi ${data.parentName},</p>
      <p>Just a friendly reminder &mdash; <strong>${data.childName}</strong> has a session tomorrow:</p>

      ${detailTable(
        detailRow("Session", data.sessionName) +
        detailRow("Date", formatDate(data.date)) +
        detailRow("Time", data.time) +
        detailRow("Location", data.location)
      )}

      ${bringSection}

      ${cta("View Booking", `${origin}/parent/bookings`)}
    `),
  };
}

// ========================
// i) Session Reminder (Coach)
// ========================

export function sessionReminderCoach(data: {
  coachName: string;
  sessions: Array<{
    time: string;
    centreName: string;
    address: string;
    childCount: number;
    programme: string;
    contactName: string;
    contactPhone: string;
  }>;
}): { subject: string; html: string } {
  const origin = originFor("staff");
  const sessionRows = data.sessions
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-weight:600;">${s.time}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.centreName}<br><span style="color:${BRAND_GREY};font-size:12px;">${s.address}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.programme}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.childCount} kids</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-size:12px;">${s.contactName}<br>${s.contactPhone}</td>
      </tr>`
    )
    .join("");

  return {
    subject: `Tomorrow's Sessions — ${data.sessions.length} session${data.sessions.length > 1 ? "s" : ""}`,
    html: staffLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Your Sessions Tomorrow</h2>
      <p>Hi ${data.coachName},</p>
      <p>Here's your schedule for tomorrow:</p>

      <table role="presentation" style="width:100%;border:1px solid #E5E5E5;border-radius:6px;overflow:hidden;margin:16px 0;">
        <tr style="background:#F9F9F9;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Time</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Location</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Programme</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Kids</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Contact</th>
        </tr>
        ${sessionRows}
      </table>

      <p>Please arrive 10 minutes early to set up. Good luck!</p>

      ${cta("View Full Schedule", `${origin}/coach/schedule`)}
    `),
  };
}

// ========================
// j) Roster Assignment
// ========================

export function rosterAssignment(data: {
  coachName: string;
  sessionName: string;
  centreName: string;
  date: string;
  time: string;
  address: string;
}): { subject: string; html: string } {
  const origin = originFor("staff");
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`;

  return {
    subject: `New Shift: ${data.sessionName} at ${data.centreName}`,
    html: staffLayout(`
      <p>Hi ${data.coachName},</p>
      <p>You've been assigned a new session:</p>

      ${detailTable(
        detailRow("Session", data.sessionName) +
        detailRow("Centre", data.centreName) +
        detailRow("Date", formatDate(data.date)) +
        detailRow("Time", data.time) +
        `<tr><td style="padding:8px 12px;color:${BRAND_GREY};width:120px;background:#FAFAFA;">Address</td><td style="padding:8px 12px;font-weight:600;"><a href="${mapsLink}" style="color:${BRAND_ORANGE};text-decoration:none;">${data.address}</a></td></tr>`
      )}

      <p>Please confirm or decline this shift in the app.</p>

      ${cta("View Shift", `${origin}/coach/schedule`)}
    `),
  };
}

// ========================
// k) Roster Change
// ========================

export function rosterChange(data: {
  coachName: string;
  changeType: "moved" | "cancelled";
  originalSession: string;
  newSession?: string;
}): { subject: string; html: string } {
  const origin = originFor("staff");
  const isCancelled = data.changeType === "cancelled";
  const detail = isCancelled
    ? `<p>Your session <strong>${data.originalSession}</strong> has been <strong>cancelled</strong>.</p>`
    : `<p>Your session <strong>${data.originalSession}</strong> has been <strong>moved</strong> to <strong>${data.newSession}</strong>.</p>`;

  return {
    subject: isCancelled
      ? `Shift Cancelled: ${data.originalSession}`
      : `Shift Update: ${data.originalSession}`,
    html: staffLayout(`
      <p>Hi ${data.coachName},</p>
      ${detail}
      <p>Please check your schedule for the latest updates.</p>
      ${cta("View Updated Schedule", `${origin}/coach/schedule`)}
    `),
  };
}

// ========================
// l) Weekly Schedule
// ========================

export function weeklySchedule(data: {
  coachName: string;
  weekStartDate: string;
  sessions: Array<{
    day: string;
    time: string;
    centreName: string;
    address: string;
    programme: string;
  }>;
}): { subject: string; html: string } {
  const origin = originFor("staff");
  const sessionRows = data.sessions
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-weight:600;">${s.day}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.time}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.centreName}<br><span style="color:${BRAND_GREY};font-size:12px;">${s.address}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;">${s.programme}</td>
      </tr>`
    )
    .join("");

  const noSessions = data.sessions.length === 0
    ? `<p style="padding:16px;background:#F9F9F9;border-radius:6px;text-align:center;color:${BRAND_GREY};">No sessions scheduled this week.</p>`
    : "";

  return {
    subject: `Your Week Ahead — ${formatDate(data.weekStartDate)}`,
    html: staffLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Your Week Ahead</h2>
      <p>Hi ${data.coachName},</p>
      <p>Here's your schedule for the week of <strong>${formatDate(data.weekStartDate)}</strong>:</p>

      ${noSessions || `<table role="presentation" style="width:100%;border:1px solid #E5E5E5;border-radius:6px;overflow:hidden;margin:16px 0;">
        <tr style="background:#F9F9F9;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Day</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Time</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Location</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};">Programme</th>
        </tr>
        ${sessionRows}
      </table>`}

      <p><strong>${data.sessions.length} session${data.sessions.length !== 1 ? "s" : ""}</strong> this week.</p>

      ${cta("View Full Schedule", `${origin}/coach/schedule`)}
    `),
  };
}

// ========================
// m) Feedback Request
// ========================

export function feedbackRequest(data: {
  directorName: string;
  centreName: string;
  sessionDate: string;
  coachName: string;
  feedbackUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `How was today's session? — Build Alpha Kids`,
    html: staffLayout(`
      <p>Hi ${data.directorName},</p>
      <p>We hope today's session at <strong>${data.centreName}</strong> went well!</p>
      <p><strong>${data.coachName}</strong> delivered a session on <strong>${formatDate(data.sessionDate)}</strong>. We'd love your quick feedback &mdash; it only takes 10 seconds:</p>
      ${cta("Rate This Session", data.feedbackUrl)}
      <p style="color:${BRAND_GREY};font-size:13px;">Your feedback helps us maintain the highest coaching standards.</p>
    `),
  };
}

// ========================
// n) Invoice Ready
// ========================

export function invoiceReady(data: {
  directorName: string;
  centreName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  portalUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Invoice ${data.invoiceNumber} — Build Alpha Kids`,
    html: staffLayout(`
      <p>Hi ${data.directorName},</p>
      <p>Your invoice for <strong>${data.centreName}</strong> is ready:</p>

      ${detailTable(
        detailRow("Invoice #", data.invoiceNumber) +
        detailRow("Amount", `<span style="color:${BRAND_ORANGE};font-weight:700;">${data.amount}</span>`) +
        detailRow("Due Date", data.dueDate)
      )}

      ${cta("View Invoice", data.portalUrl)}

      <p>If you have any questions, please contact us at <a href="mailto:contact@buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">contact@buildalphakids.com.au</a>.</p>
    `),
  };
}

// ========================
// o) Invitation
// ========================

export function invitation(data: {
  name: string;
  role: string;
  inviteUrl: string;
  invitedBy: string;
}): { subject: string; html: string } {
  const roleLabel =
    data.role === "centre_director"
      ? "Centre Director"
      : data.role.charAt(0).toUpperCase() + data.role.slice(1);

  return {
    subject: "You're invited to Build Alpha Kids",
    html: layout(
      `
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">You're Invited!</h2>
      <p>Hi ${data.name},</p>
      <p><strong>${data.invitedBy}</strong> has invited you to join <strong>Build Alpha Kids</strong> as a <strong>${roleLabel}</strong>.</p>
      <p>Click below to accept and set up your account:</p>
      ${cta("Accept Invitation", data.inviteUrl)}
      <p style="color:${BRAND_GREY};font-size:13px;">This invitation expires in 30 days. If you weren't expecting this, you can safely ignore it.</p>
    `,
      // A parent invite must land on the consumer brand; coach and
      // centre_director invites are operational.
      data.role === "parent" ? "parent" : "staff"
    ),
  };
}
