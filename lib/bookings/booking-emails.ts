// ============================================================
// Booking email templates — inline-styled HTML with BAK branding
// Parent-facing emails for bookings, reminders, cancellations, packages
// ============================================================
//
// Every link here goes to a PARENT, so it targets the marketing origin
// (buildalphakids.com.au) — parents live on the consumer brand and get
// one cookie jar. See the audience principle in the marketing-site plan.

import { getMarketingUrl } from "@/lib/utils/base-url";

const BRAND_ORANGE = "#E8712A";
const BRAND_WARM_BG = "#FFF7ED";
const BRAND_DARK = "#1A1A1A";
const BRAND_GREY = "#666666";

function parentLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${BRAND_WARM_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_WARM_BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:${BRAND_ORANGE};padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">Build Alpha Kids</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px;color:${BRAND_DARK};font-size:14px;line-height:1.6;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E5E5;color:${BRAND_GREY};font-size:12px;text-align:center;">
          Build Alpha Kids &bull; Multi-Sport Coaching for Kids<br>
          <a href="${getMarketingUrl()}/parent" style="color:${BRAND_ORANGE};text-decoration:none;">Open Parent Portal</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ========================
// Helper: format cents to dollars
// ========================

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ========================
// Helper: format date for display
// ========================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ========================
// 1. Booking Confirmation
// ========================

export function bookingConfirmationEmail(
  session: {
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    location_name: string;
    location_address: string;
  },
  children: { name: string }[],
  totalCents: number
): { subject: string; html: string } {
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location_address)}`;
  const childList = children
    .map((c) => `<li style="margin-bottom:4px;">${c.name}</li>`)
    .join("");

  return {
    subject: `Booking Confirmed — ${session.title}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Booking Confirmed!</h2>
      <p>Great news — your booking has been confirmed. Here are the details:</p>

      <table role="presentation" style="margin:16px 0;width:100%;border:1px solid #F0F0F0;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};width:120px;background:#FAFAFA;">Session</td><td style="padding:8px 12px;font-weight:600;">${session.title}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Date</td><td style="padding:8px 12px;font-weight:600;">${formatDate(session.date)}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Time</td><td style="padding:8px 12px;font-weight:600;">${session.start_time} – ${session.end_time}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Location</td><td style="padding:8px 12px;font-weight:600;"><a href="${mapsLink}" style="color:${BRAND_ORANGE};text-decoration:none;">${session.location_name}</a></td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Total Paid</td><td style="padding:8px 12px;font-weight:700;color:${BRAND_ORANGE};">${formatDollars(totalCents)}</td></tr>
      </table>

      <p style="font-weight:600;">Children Attending:</p>
      <ul style="margin:8px 0 16px;padding-left:20px;">${childList}</ul>

      <div style="padding:12px;background:${BRAND_WARM_BG};border-radius:6px;border-left:3px solid ${BRAND_ORANGE};margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:600;">What to Bring:</p>
        <ul style="margin:0;padding-left:20px;">
          <li style="margin-bottom:4px;">Comfortable clothes and closed-toe shoes</li>
          <li style="margin-bottom:4px;">Water bottle</li>
          <li style="margin-bottom:4px;">Sun protection (hat, sunscreen)</li>
        </ul>
      </div>

      <p style="color:${BRAND_GREY};font-size:12px;margin-top:16px;">
        <strong>Cancellation Policy:</strong> Cancel more than 24 hours before the session for a full refund. Cancellations within 24 hours are not eligible for a refund.
      </p>

      <div style="text-align:center;margin-top:24px;">
        <a href="${getMarketingUrl()}/parent/bookings" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View My Bookings</a>
      </div>
    `),
  };
}

// ========================
// 2. Booking Reminder (24h)
// ========================

export function bookingReminderEmail(
  session: {
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    location_name: string;
    location_address: string;
  },
  children: { name: string }[]
): { subject: string; html: string } {
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location_address)}`;
  const childList = children
    .map((c) => `<li style="margin-bottom:4px;">${c.name}</li>`)
    .join("");

  return {
    subject: `Tomorrow: ${session.title}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Session Tomorrow!</h2>
      <p>Just a friendly reminder — you have a session booked for tomorrow:</p>

      <table role="presentation" style="margin:16px 0;width:100%;border:1px solid #F0F0F0;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};width:120px;background:#FAFAFA;">Session</td><td style="padding:8px 12px;font-weight:600;">${session.title}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Date</td><td style="padding:8px 12px;font-weight:600;">${formatDate(session.date)}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Time</td><td style="padding:8px 12px;font-weight:600;">${session.start_time} – ${session.end_time}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Location</td><td style="padding:8px 12px;font-weight:600;"><a href="${mapsLink}" style="color:${BRAND_ORANGE};text-decoration:none;">${session.location_name}</a></td></tr>
      </table>

      <p style="font-weight:600;">Children Attending:</p>
      <ul style="margin:8px 0 16px;padding-left:20px;">${childList}</ul>

      <p>Remember to bring comfortable clothes, a water bottle, and sun protection. See you there!</p>

      <div style="text-align:center;margin-top:24px;">
        <a href="${getMarketingUrl()}/parent/bookings" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View My Bookings</a>
      </div>
    `),
  };
}

// ========================
// 3. Booking Cancellation
// ========================

export function bookingCancellationEmail(
  session: {
    title: string;
    date: string;
    start_time: string;
    location_name: string;
  },
  refundEligible: boolean,
  totalCents: number
): { subject: string; html: string } {
  const refundBlock = refundEligible
    ? `<div style="padding:12px;background:#ECFDF5;border-radius:6px;border-left:3px solid #10B981;margin:16px 0;">
        <p style="margin:0;color:#065F46;font-weight:600;">A refund of ${formatDollars(totalCents)} will be processed to your original payment method. Please allow 5–10 business days for the refund to appear.</p>
      </div>`
    : `<div style="padding:12px;background:#FEF2F2;border-radius:6px;border-left:3px solid #EF4444;margin:16px 0;">
        <p style="margin:0;color:#991B1B;">Unfortunately, this booking was cancelled within 24 hours of the session and is not eligible for a refund.</p>
      </div>`;

  return {
    subject: `Booking Cancelled — ${session.title}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Booking Cancelled</h2>
      <p>Your booking for the following session has been cancelled:</p>

      <table role="presentation" style="margin:16px 0;width:100%;border:1px solid #F0F0F0;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};width:120px;background:#FAFAFA;">Session</td><td style="padding:8px 12px;font-weight:600;">${session.title}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Date</td><td style="padding:8px 12px;font-weight:600;">${formatDate(session.date)}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Time</td><td style="padding:8px 12px;font-weight:600;">${session.start_time}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Location</td><td style="padding:8px 12px;font-weight:600;">${session.location_name}</td></tr>
      </table>

      ${refundBlock}

      <p>If you'd like to book another session, you can browse available sessions in your parent portal.</p>

      <div style="text-align:center;margin-top:24px;">
        <a href="${getMarketingUrl()}/parent/book" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">Browse Sessions</a>
      </div>
    `),
  };
}

// ========================
// 4. Package Purchase Confirmation
// ========================

export function packagePurchaseEmail(
  packageName: string,
  sessionCount: number,
  expiresAt: string
): { subject: string; html: string } {
  return {
    subject: `Session Pack Purchased — ${packageName}`,
    html: parentLayout(`
      <h2 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">Session Pack Purchased!</h2>
      <p>Thanks for your purchase! Your session pack is ready to use.</p>

      <table role="presentation" style="margin:16px 0;width:100%;border:1px solid #F0F0F0;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};width:140px;background:#FAFAFA;">Pack</td><td style="padding:8px 12px;font-weight:600;">${packageName}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Sessions Available</td><td style="padding:8px 12px;font-weight:700;color:${BRAND_ORANGE};">${sessionCount}</td></tr>
        <tr><td style="padding:8px 12px;color:${BRAND_GREY};background:#FAFAFA;">Expires</td><td style="padding:8px 12px;font-weight:600;">${formatDate(expiresAt)}</td></tr>
      </table>

      <p>You can use your pack sessions when booking any eligible session. Just select "Use Session Pack" at checkout.</p>

      <div style="text-align:center;margin-top:24px;">
        <a href="${getMarketingUrl()}/parent/book" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">Browse Sessions</a>
      </div>
    `),
  };
}
