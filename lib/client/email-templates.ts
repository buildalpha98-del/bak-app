// ============================================================
// Client portal email templates
// ============================================================

const BRAND_TEAL = "#0891B2";
const BRAND_DARK = "#1A1A1A";
const BRAND_GREY = "#666666";

function clientLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:${BRAND_TEAL};padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">Build Alpha Kids</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Centre Portal</p>
        </td></tr>
        <tr><td style="padding:24px;color:${BRAND_DARK};font-size:14px;line-height:1.6;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E5E5;color:${BRAND_GREY};font-size:12px;text-align:center;">
          Build Alpha Kids &bull; Centre Portal
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function clientInvitationEmail(
  contactName: string,
  centreName: string,
  loginUrl: string
): { subject: string; html: string } {
  return {
    subject: `You're invited to the Build Alpha Kids Centre Portal — ${centreName}`,
    html: clientLayout(`
      <p>Hi ${contactName},</p>
      <p>You've been invited to the <strong>Build Alpha Kids Centre Portal</strong> for <strong>${centreName}</strong>.</p>
      <p>From your portal you can:</p>
      <ul style="color:${BRAND_DARK};font-size:14px;line-height:1.8;">
        <li>View your session schedule and history</li>
        <li>See attendance and participation data</li>
        <li>Access term reports and assessments</li>
        <li>Browse coaching programs</li>
        <li>Message the Build Alpha Kids team</li>
        <li>View and manage invoices</li>
      </ul>
      <p>Click the button below to access your portal — no password needed, we'll send you a magic link each time you sign in.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND_TEAL};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Access Your Portal</a>
      </div>
      <p style="color:${BRAND_GREY};font-size:13px;">If you didn't expect this invitation, you can safely ignore this email.</p>
    `),
  };
}

export function clientMagicLinkEmail(
  contactName: string,
  centreName: string
): { subject: string; html: string } {
  return {
    subject: `Sign in to your Build Alpha Kids portal — ${centreName}`,
    html: clientLayout(`
      <p>Hi ${contactName},</p>
      <p>Click the button below to sign in to your <strong>${centreName}</strong> portal.</p>
      <p style="color:${BRAND_GREY};font-size:13px;margin-top:16px;">This link will expire in 1 hour. If you didn't request this, you can safely ignore it.</p>
    `),
  };
}
