import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import {
  renderMergeFields,
  buildEmailHtml,
  pickSendOutcome,
} from "@/lib/crm/sequence-render";

export const dynamic = "force-dynamic";

// ============================================================
// Sequence processing cron — runs every 6 hours (see vercel.json)
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

      const outcome = pickSendOutcome(
        {
          id: send.id,
          lead_id: send.lead_id,
          sequence_id: send.sequence_id,
          step_id: send.step_id,
          scheduled_for: send.scheduled_for,
        },
        {
          active_sequence_id: lead.active_sequence_id,
          sequence_paused: lead.sequence_paused,
          contact_email: lead.contact_email,
        },
        now
      );

      if (outcome.status === "skip") {
        // Persist "skipped" for missing email so we don't re-evaluate it forever.
        if (outcome.reason === "missing_email") {
          await supabase
            .from("email_sends")
            .update({ status: "skipped" })
            .eq("id", send.id);
        }
        skipped++;
        continue;
      }

      // Render merge fields
      const subject = renderMergeFields(step.subject, lead);
      const body = renderMergeFields(step.body, lead);

      // Send email
      const html = buildEmailHtml(body);

      const result = await sendEmail(lead.contact_email as string, subject, html);

      if (result.success) {
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
      } else {
        console.error(
          `Failed to send sequence email for lead ${send.lead_id}: ${result.error}`
        );

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
