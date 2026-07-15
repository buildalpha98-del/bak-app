import { getResend, FROM_EMAIL } from "./client";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Outbound email + audit logging
// ============================================================
//
// Every send is recorded in `email_log` (migration 042) so ops can
// answer "did we actually send that invoice / reminder / report?"
// without opening the Resend dashboard. Logging is fire-and-forget —
// an audit-write failure must never block or fail the send itself.

function logEmail(
  to: string,
  subject: string,
  status: "sent" | "failed",
  emailType: string,
  error?: string
): void {
  try {
    const admin = createSupabaseAdmin();
    void admin
      .from("email_log")
      .insert({
        recipient_email: to,
        email_type: emailType,
        subject,
        status,
        metadata: error ? { error } : {},
      })
      .then(({ error: insertError }) => {
        if (insertError) {
          console.error("email_log insert failed:", insertError.message);
        }
      });
  } catch (err) {
    console.error("email_log logging threw:", err);
  }
}

/**
 * Send an email via Resend. Logs errors but does not throw.
 * `emailType` tags the email_log row (e.g. "invoice", "magic_link",
 * "digest") — defaults to "generic" for callers that don't pass it.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  emailType: string = "generic"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend send error:", error);
      logEmail(to, subject, "failed", emailType, error.message);
      return { success: false, error: error.message };
    }

    logEmail(to, subject, "sent", emailType);
    return { success: true };
  } catch (err) {
    console.error("sendEmail exception:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    logEmail(to, subject, "failed", emailType, message);
    return { success: false, error: message };
  }
}

/**
 * Send an email with a file attachment via Resend.
 */
export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  attachment: { filename: string; content: Buffer },
  emailType: string = "generic_attachment"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content,
        },
      ],
    });

    if (error) {
      console.error("Resend send error:", error);
      logEmail(to, subject, "failed", emailType, error.message);
      return { success: false, error: error.message };
    }

    logEmail(to, subject, "sent", emailType);
    return { success: true };
  } catch (err) {
    console.error("sendEmailWithAttachment exception:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    logEmail(to, subject, "failed", emailType, message);
    return { success: false, error: message };
  }
}
