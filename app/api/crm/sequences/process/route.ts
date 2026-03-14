import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { SPORTS } from "@/lib/types/enums";

export const dynamic = "force-dynamic";

// ============================================================
// Sequence processing cron — runs daily or every 6 hours
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret or admin
    const cronSecret = request.headers.get("authorization");
    if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const supabase = createSupabaseAdmin();
    const now = new Date();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Find all scheduled sends that are due
    const { data: dueSends } = await supabase
      .from("email_sends")
      .select(
        "id, lead_id, sequence_id, step_id, scheduled_for, email_sequence_steps!inner(subject, body), leads!inner(centre_name, contact_name, contact_email, active_sequence_id, sequence_paused)"
      )
      .eq("status", "scheduled")
      .lte("scheduled_for", now.toISOString())
      .limit(100);

    for (const send of dueSends ?? []) {
      const lead = send.leads as unknown as {
        centre_name: string;
        contact_name: string | null;
        contact_email: string | null;
        active_sequence_id: string | null;
        sequence_paused: boolean;
      };

      const step = send.email_sequence_steps as unknown as {
        subject: string;
        body: string;
      };

      // Skip if sequence is paused or no longer active
      if (lead.sequence_paused || lead.active_sequence_id !== send.sequence_id) {
        skipped++;
        continue;
      }

      // Skip if no email address
      if (!lead.contact_email) {
        await supabase
          .from("email_sends")
          .update({ status: "skipped" })
          .eq("id", send.id);
        skipped++;
        continue;
      }

      // Render merge fields
      const subject = renderMergeFields(step.subject, lead);
      const body = renderMergeFields(step.body, lead);

      // Send email
      const html = buildEmailHtml(body);

      try {
        await sendEmail(lead.contact_email, subject, html);

        await supabase
          .from("email_sends")
          .update({
            status: "sent",
            sent_at: now.toISOString(),
          })
          .eq("id", send.id);

        // Create lead activity
        await supabase.from("lead_activities").insert({
          lead_id: send.lead_id,
          type: "email_sent",
          content: `Sequence email sent: "${subject}"`,
          metadata: { step_id: send.step_id, sequence_id: send.sequence_id },
        });

        sent++;
      } catch (emailErr) {
        console.error(`Failed to send sequence email for lead ${send.lead_id}:`, emailErr);

        await supabase
          .from("email_sends")
          .update({ status: "failed" })
          .eq("id", send.id);

        failed++;
      }

      // Check if sequence is complete (all steps sent)
      const { data: remainingSteps } = await supabase
        .from("email_sends")
        .select("id")
        .eq("lead_id", send.lead_id)
        .eq("sequence_id", send.sequence_id)
        .eq("status", "scheduled");

      if (!remainingSteps || remainingSteps.length === 0) {
        // Sequence complete
        await supabase
          .from("leads")
          .update({
            active_sequence_id: null,
            sequence_paused: false,
            updated_at: now.toISOString(),
          })
          .eq("id", send.lead_id);

        await supabase.from("lead_activities").insert({
          lead_id: send.lead_id,
          type: "system",
          content: "Email sequence completed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: { sent, failed, skipped, total: dueSends?.length ?? 0 },
    });
  } catch (err) {
    console.error("Sequence processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// ============================================================
// Helpers
// ============================================================

function renderMergeFields(
  template: string,
  lead: { centre_name: string; contact_name: string | null }
): string {
  return template
    .replace(/\{centre_name\}/g, lead.centre_name)
    .replace(/\{contact_name\}/g, lead.contact_name ?? "there")
    .replace(/\{your_name\}/g, "The Build Alpha Kids Team")
    .replace(/\{sport_list\}/g, SPORTS.join(", "));
}

function buildEmailHtml(body: string): string {
  const paragraphs = body
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#E8712A;padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">Build Alpha Kids</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#1A1A1A;font-size:14px;">
          ${paragraphs}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E5E5;color:#666666;font-size:12px;text-align:center;">
          Build Alpha Kids &bull; Multi-Sport Coaching
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
