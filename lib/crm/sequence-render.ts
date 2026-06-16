// ============================================================
// Email sequence rendering + step picking — pure helpers
// ============================================================
// Extracted from /api/crm/sequences/process/route.ts so the
// logic can be unit-tested without booting the Next.js runtime.

import { SPORTS } from "@/lib/types/enums";

export interface MergeFieldLead {
  centre_name: string;
  contact_name: string | null;
}

export interface ScheduledSendLike {
  id: string;
  lead_id: string;
  sequence_id: string;
  step_id: string;
  scheduled_for: string;
}

export interface ActiveLeadLike {
  active_sequence_id: string | null;
  sequence_paused: boolean;
  contact_email: string | null;
}

export type SkipReason = "paused" | "wrong_sequence" | "missing_email" | "not_due";

export interface PickerOutcome {
  send: ScheduledSendLike;
  status: "send" | "skip";
  reason?: SkipReason;
}

// ============================================================
// Merge field rendering
// ============================================================

/**
 * Render merge fields in a template string. Supports:
 *   {centre_name}, {contact_name}, {your_name}, {sport_list}
 *
 * Missing contact_name falls back to "there" so the email still
 * reads naturally. Uses String.prototype.replaceAll so we don't
 * pull in a templating dependency.
 */
export function renderMergeFields(template: string, lead: MergeFieldLead): string {
  if (!template) return "";

  return template
    .replaceAll("{centre_name}", lead.centre_name ?? "")
    .replaceAll("{contact_name}", lead.contact_name ?? "there")
    .replaceAll("{your_name}", "The Build Alpha Kids Team")
    .replaceAll("{sport_list}", SPORTS.join(", "));
}

// ============================================================
// HTML wrapper
// ============================================================

/**
 * Wrap plain-text body in our branded HTML shell.
 * Preserves paragraph breaks (double-newline) and soft breaks (single newline).
 */
export function buildEmailHtml(body: string): string {
  const paragraphs = (body ?? "")
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

// ============================================================
// Step picker — decide whether a scheduled send should fire
// ============================================================

/**
 * Decide if a scheduled email_sends row is eligible to send right now.
 *
 * Rules:
 *  - If the lead has paused the sequence -> skip ("paused").
 *  - If the lead's active_sequence_id no longer matches the send's
 *    sequence_id (lead moved stages or stopped) -> skip ("wrong_sequence").
 *  - If the lead has no contact_email -> skip ("missing_email").
 *  - If scheduled_for is still in the future -> skip ("not_due").
 *  - Otherwise -> send.
 */
export function pickSendOutcome(
  send: ScheduledSendLike,
  lead: ActiveLeadLike,
  now: Date
): PickerOutcome {
  if (lead.sequence_paused) {
    return { send, status: "skip", reason: "paused" };
  }
  if (lead.active_sequence_id !== send.sequence_id) {
    return { send, status: "skip", reason: "wrong_sequence" };
  }
  if (!lead.contact_email) {
    return { send, status: "skip", reason: "missing_email" };
  }
  if (new Date(send.scheduled_for).getTime() > now.getTime()) {
    return { send, status: "skip", reason: "not_due" };
  }
  return { send, status: "send" };
}
