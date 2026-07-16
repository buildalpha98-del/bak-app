// ============================================================
// Parent portal email templates
// ============================================================
//
// Parent-facing: links target the marketing origin so a parent has one
// cookie jar on buildalphakids.com.au. See the plan's audience principle.

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
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:${BRAND_ORANGE};padding:24px;text-align:center;">
          <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:700;">Build Alpha Kids</h1>
        </td></tr>
        <tr><td style="padding:28px 24px;color:${BRAND_DARK};font-size:15px;line-height:1.7;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #F0E6DC;color:${BRAND_GREY};font-size:12px;text-align:center;">
          Build Alpha Kids &bull; Multi-Sport Coaching for Kids
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function parentMagicLinkEmail(): { subject: string; html: string } {
  return {
    subject: "Sign in to Build Alpha Kids",
    html: parentLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi there!</p>
      <p>Tap the button below to sign in and manage your kids' sessions with Build Alpha Kids.</p>
      <p style="color:${BRAND_GREY};font-size:13px;margin-top:16px;">This link will expire in 1 hour. If you didn't request this, you can safely ignore it.</p>
    `),
  };
}

export function parentWelcomeEmail(
  firstName: string,
  childNames: string[]
): { subject: string; html: string } {
  const childList = childNames.length === 1
    ? childNames[0]
    : childNames.slice(0, -1).join(", ") + " and " + childNames[childNames.length - 1];

  return {
    subject: "Welcome to Build Alpha Kids!",
    html: parentLayout(`
      <p style="font-size:16px;font-weight:600;margin-top:0;">Hi ${firstName},</p>
      <p>Welcome to Build Alpha Kids! You're all set to book sessions for <strong>${childList}</strong>.</p>
      <p>From your parent portal you can:</p>
      <ul style="color:${BRAND_DARK};font-size:14px;line-height:2;">
        <li>Browse and book sessions near you</li>
        <li>Manage your children's profiles</li>
        <li>Track upcoming and past bookings</li>
        <li>View your kids' progress and skills</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="${getMarketingUrl()}/parent-login" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">Go to Your Portal</a>
      </div>
      <p>We can't wait to see your kids in action!</p>
      <p style="color:${BRAND_GREY};font-size:13px;">— The Build Alpha Kids Team</p>
    `),
  };
}
