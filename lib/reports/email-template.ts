// ============================================================
// Report delivery email template
// ============================================================

const BRAND_ORANGE = "#E8712A";
const BRAND_DARK = "#1A1A1A";
const BRAND_GREY = "#666666";

function layout(content: string, brandName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:${BRAND_ORANGE};padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">${brandName}</h1>
        </td></tr>
        <tr><td style="padding:24px;color:${BRAND_DARK};font-size:14px;line-height:1.6;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E5E5;color:${BRAND_GREY};font-size:12px;text-align:center;">
          ${brandName} &bull; Term Report
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function reportDeliveryEmail(
  centreName: string,
  termName: string,
  brandName: string
): { subject: string; html: string } {
  return {
    subject: `Term Report: ${centreName} — ${termName}`,
    html: layout(
      `
      <p>Hi ${centreName} Team,</p>
      <p>Please find attached your <strong>${termName}</strong> term report, summarising all coaching sessions, attendance, and key highlights.</p>
      <p>This report includes:</p>
      <ul style="color:${BRAND_DARK};font-size:14px;line-height:1.8;">
        <li>Sessions delivered and sports covered</li>
        <li>Attendance summary</li>
        <li>Skill assessment outcomes (if applicable)</li>
        <li>Coach observations and highlights</li>
      </ul>
      <p>If you have any questions, please don't hesitate to reach out.</p>
      <p style="color:${BRAND_GREY};font-size:13px;margin-top:16px;">The full report PDF is attached to this email.</p>
    `,
      brandName
    ),
  };
}
