// ============================================================
// Email templates — inline-styled HTML with BAK branding
// ============================================================

const BRAND_ORANGE = "#E8712A";
const BRAND_DARK = "#1A1A1A";
const BRAND_GREY = "#666666";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0;">
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
          Build Alpha Kids &bull; Multi-Sport Coaching<br>
          <a href="https://app.buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">Open App</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ========================
// Specific templates
// ========================

export function shiftAssignmentEmail(
  coachName: string,
  sport: string,
  centreName: string,
  date: string,
  time: string
): { subject: string; html: string } {
  return {
    subject: `New Shift: ${sport} at ${centreName} — ${date}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>You've been assigned a new session:</p>
      <table role="presentation" style="margin:16px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:100px;">Sport</td><td style="padding:4px 8px;font-weight:600;">${sport}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Centre</td><td style="padding:4px 8px;font-weight:600;">${centreName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Date</td><td style="padding:4px 8px;font-weight:600;">${date}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Time</td><td style="padding:4px 8px;font-weight:600;">${time}</td></tr>
      </table>
      <p>Please confirm or decline this shift in the app.</p>
      <a href="https://app.buildalphakids.com.au/coach/schedule" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View Shift</a>
    `),
  };
}

export function shiftCancellationEmail(
  coachName: string,
  sport: string,
  centreName: string,
  date: string
): { subject: string; html: string } {
  return {
    subject: `Shift Cancelled: ${sport} at ${centreName} — ${date}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>Your ${sport} session at <strong>${centreName}</strong> on <strong>${date}</strong> has been cancelled.</p>
      <p>Please check your schedule for any updates.</p>
      <a href="https://app.buildalphakids.com.au/coach/schedule" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View Schedule</a>
    `),
  };
}

export function swapRequestEmail(
  coachName: string,
  requestingCoachName: string,
  sport: string,
  centreName: string,
  date: string
): { subject: string; html: string } {
  return {
    subject: `Swap Request: ${sport} at ${centreName} — ${date}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p><strong>${requestingCoachName}</strong> has requested you to take over their <strong>${sport}</strong> session at <strong>${centreName}</strong> on <strong>${date}</strong>.</p>
      <p>Please respond in the app.</p>
      <a href="https://app.buildalphakids.com.au/coach/schedule" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View Request</a>
    `),
  };
}

export function formReminderEmail(
  coachName: string,
  formType: string,
  sessionDetails: string
): { subject: string; html: string } {
  return {
    subject: `Form Reminder: ${formType}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>You have a pending <strong>${formType}</strong> form for: ${sessionDetails}.</p>
      <p>Please complete it at your earliest convenience.</p>
      <a href="https://app.buildalphakids.com.au/coach" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">Open App</a>
    `),
  };
}

export function complianceExpiryEmail(
  coachName: string,
  docType: string,
  expiryDate: string,
  daysRemaining: number
): { subject: string; html: string } {
  const urgency = daysRemaining <= 7 ? "URGENT: " : "";
  return {
    subject: `${urgency}${docType} expiring ${daysRemaining <= 7 ? "in " + daysRemaining + " days" : "on " + expiryDate}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>Your <strong>${docType}</strong> is ${daysRemaining <= 7 ? `expiring in <strong>${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}</strong>` : `expiring on <strong>${expiryDate}</strong>`}.</p>
      <p>Please update your compliance documents to continue receiving session assignments.</p>
      <a href="https://app.buildalphakids.com.au/coach/profile" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">Update Documents</a>
    `),
  };
}

export function invoiceReceivedEmail(
  coachName: string,
  period: string
): { subject: string; html: string } {
  return {
    subject: `Invoice Ready: ${period}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>Your invoice for the period <strong>${period}</strong> is ready for review.</p>
      <a href="https://app.buildalphakids.com.au/coach/invoices" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View Invoice</a>
    `),
  };
}

export function invoiceSentToAdminEmail(
  coachName: string,
  invoiceNumber: string,
  period: string,
  totalAmount: string
): { subject: string; html: string } {
  return {
    subject: `Coach Invoice Received: ${invoiceNumber}`,
    html: layout(`
      <p>Hi Team,</p>
      <p>A new coach invoice has been submitted for processing:</p>
      <table role="presentation" style="margin:16px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:120px;">Coach</td><td style="padding:4px 8px;font-weight:600;">${coachName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Invoice #</td><td style="padding:4px 8px;font-weight:600;">${invoiceNumber}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Period</td><td style="padding:4px 8px;font-weight:600;">${period}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Total</td><td style="padding:4px 8px;font-weight:600;color:${BRAND_ORANGE};">${totalAmount}</td></tr>
      </table>
      <p>The invoice PDF is attached to this email. You can also view it in the app.</p>
      <a href="https://app.buildalphakids.com.au/admin/invoicing" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View Invoices</a>
    `),
  };
}

export function invoiceFlagResolvedEmail(
  coachName: string,
  invoiceNumber: string,
  resolutionNote: string
): { subject: string; html: string } {
  return {
    subject: `Invoice ${invoiceNumber} — Flags Resolved`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>The flagged items on your invoice <strong>${invoiceNumber}</strong> have been reviewed and resolved by the operations team.</p>
      ${resolutionNote ? `<p style="padding:12px;background:#F5F5F5;border-radius:6px;border-left:3px solid ${BRAND_ORANGE};"><strong>Resolution note:</strong> ${resolutionNote}</p>` : ""}
      <p>Your invoice is now ready to send. Please review the updated amounts and send when you're happy.</p>
      <a href="https://app.buildalphakids.com.au/coach/invoicing" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View Invoice</a>
    `),
  };
}

export function genericNotificationEmail(
  userName: string,
  title: string,
  body: string
): { subject: string; html: string } {
  return {
    subject: title,
    html: layout(`
      <p>Hi ${userName},</p>
      <p>${body}</p>
      <a href="https://app.buildalphakids.com.au" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">Open App</a>
    `),
  };
}

export function dailyDigestEmail(
  userName: string,
  notifications: { title: string; body: string; created_at: string }[]
): { subject: string; html: string } {
  const rows = notifications
    .map(
      (n) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;font-weight:600;font-size:13px;">${n.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F0F0F0;color:${BRAND_GREY};font-size:13px;">${n.body}</td>
      </tr>`
    )
    .join("");

  return {
    subject: `Daily Summary — ${notifications.length} notification${notifications.length !== 1 ? "s" : ""}`,
    html: layout(`
      <p>Hi ${userName},</p>
      <p>Here's your daily summary of ${notifications.length} unread notification${notifications.length !== 1 ? "s" : ""}:</p>
      <table role="presentation" style="width:100%;border:1px solid #E5E5E5;border-radius:6px;overflow:hidden;margin:16px 0;">
        <tr style="background:#F9F9F9;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};font-weight:600;">Title</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:${BRAND_GREY};font-weight:600;">Details</th>
        </tr>
        ${rows}
      </table>
      <a href="https://app.buildalphakids.com.au" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">View All in App</a>
    `),
  };
}

// ========================
// Onboarding email templates
// ========================

export function onboardingWelcomeEmail(
  centreName: string,
  contactName: string
): { subject: string; html: string } {
  return {
    subject: `Welcome to Build Alpha Kids — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Welcome to <strong>Build Alpha Kids</strong>! We're thrilled to be partnering with <strong>${centreName}</strong> to deliver fun, high-quality multi-sport coaching sessions for your children.</p>
      <p>Here's what to expect next:</p>
      <ol style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">We'll reach out to collect a list of enrolled children so we can prepare attendance rolls.</li>
        <li style="margin-bottom:8px;">We'll coordinate the schedule for your first sessions.</li>
        <li style="margin-bottom:8px;">You'll receive access to your <strong>Client Portal</strong> where you can view schedules, reports, and child progress.</li>
      </ol>
      <p>If you have any questions in the meantime, just reply to this email — we're here to help!</p>
      <p style="margin-top:24px;">Cheers,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function onboardingChildListRequestEmail(
  centreName: string,
  contactName: string
): { subject: string; html: string } {
  return {
    subject: `Action Required: Child Enrolment List — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>We're getting everything ready for <strong>${centreName}</strong>'s coaching sessions!</p>
      <p>To set up attendance rolls and skill tracking, we need a list of enrolled children. Could you please send us:</p>
      <ul style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Child's first name and last name</li>
        <li style="margin-bottom:8px;">Date of birth or age group</li>
        <li style="margin-bottom:8px;">Any medical or allergy notes (if applicable)</li>
      </ul>
      <p>A spreadsheet (CSV or Excel) works perfectly — just reply to this email with it attached.</p>
      <p style="padding:12px;background:#FFF3E0;border-radius:6px;border-left:3px solid ${BRAND_ORANGE};">
        <strong>Tip:</strong> If you don't have a formal list yet, just send what you have and we can add children as they enrol.
      </p>
      <p style="margin-top:24px;">Thanks,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function onboardingPortalInviteEmail(
  centreName: string,
  contactName: string,
  portalUrl: string
): { subject: string; html: string } {
  return {
    subject: `Your Client Portal is Ready — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Great news! Your <strong>Client Portal</strong> for <strong>${centreName}</strong> is now set up and ready to use.</p>
      <p>Through the portal you can:</p>
      <ul style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">View your upcoming session schedule</li>
        <li style="margin-bottom:8px;">Track attendance and child participation</li>
        <li style="margin-bottom:8px;">Access skill assessment reports</li>
        <li style="margin-bottom:8px;">View and download invoices</li>
        <li style="margin-bottom:8px;">Message the Build Alpha Kids team</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Access Your Portal</a>
      </div>
      <p style="color:${BRAND_GREY};font-size:13px;">You'll receive a magic link each time you log in — no password needed.</p>
      <p style="margin-top:24px;">Cheers,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function onboardingSessionPrepEmail(
  centreName: string,
  contactName: string,
  sessionDate: string,
  coachName: string,
  sport: string
): { subject: string; html: string } {
  return {
    subject: `Your First Session is Coming Up! — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Exciting news — your first coaching session at <strong>${centreName}</strong> is just around the corner!</p>
      <table role="presentation" style="margin:16px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:100px;">Date</td><td style="padding:4px 8px;font-weight:600;">${sessionDate}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Coach</td><td style="padding:4px 8px;font-weight:600;">${coachName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Sport</td><td style="padding:4px 8px;font-weight:600;">${sport}</td></tr>
      </table>
      <p>Here's how to prepare:</p>
      <ul style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Ensure children have appropriate footwear and clothing</li>
        <li style="margin-bottom:8px;">Let us know about any last-minute changes to the child list</li>
        <li style="margin-bottom:8px;">Our coach will arrive 10 minutes early to set up</li>
      </ul>
      <p>We can't wait to get started!</p>
      <p style="margin-top:24px;">Cheers,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function onboardingFollowUpEmail(
  centreName: string,
  contactName: string,
  feedbackUrl: string
): { subject: string; html: string } {
  return {
    subject: `How Did the First Session Go? — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>We hope the first coaching session at <strong>${centreName}</strong> went brilliantly!</p>
      <p>We'd love to hear your thoughts — your feedback helps us tailor future sessions to your centre's needs.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${feedbackUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Share Your Feedback</a>
      </div>
      <p>If you have any questions or want to discuss the program, just reply to this email.</p>
      <p style="margin-top:24px;">Thanks,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function feedbackRequestEmail(
  centreName: string,
  coachName: string,
  sport: string,
  date: string,
  feedbackUrl: string
): { subject: string; html: string } {
  return {
    subject: `How was today's ${sport} session? — Build Alpha Kids`,
    html: layout(`
      <p>Hi ${centreName} Team,</p>
      <p>We hope today's session went well! <strong>${coachName}</strong> delivered a <strong>${sport}</strong> session on <strong>${date}</strong>.</p>
      <p>We'd love your quick feedback — it only takes 10 seconds:</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${feedbackUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Rate This Session</a>
      </div>
      <p style="color:${BRAND_GREY};font-size:13px;">Your feedback helps us maintain the highest coaching standards.</p>
    `),
  };
}
