"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

// ============================================================
// Send email from lead detail page
// ============================================================

export async function sendLeadEmail(input: {
  leadId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Build HTML email
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#E8712A;padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">Build Alpha Kids</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#1A1A1A;font-size:14px;line-height:1.6;">
          ${input.body.replace(/\n/g, "<br>")}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E5E5;color:#666666;font-size:12px;text-align:center;">
          Build Alpha Kids &bull; Multi-Sport Coaching
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmail(input.to, input.subject, html);

    // Record activity
    await supabase.from("lead_activities").insert({
      lead_id: input.leadId,
      type: "email_sent",
      content: `Email sent to ${input.to}: "${input.subject}"`,
      metadata: {
        to: input.to,
        subject: input.subject,
        body: input.body,
      },
      created_by: user?.id ?? null,
    });

    return { error: null };
  } catch (err) {
    console.error("sendLeadEmail error:", err);
    return { error: "Failed to send email." };
  }
}
