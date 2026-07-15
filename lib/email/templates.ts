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

export function onboardingDocsReminderEmail(
  centreName: string,
  contactName: string
): { subject: string; html: string } {
  return {
    subject: `Just Checking In — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>We're keen to get <strong>${centreName}</strong>'s onboarding moving along!</p>
      <p>It's been a couple of days since we kicked things off and we noticed the centre profile still needs a few details. When you have a moment, could you please:</p>
      <ul style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Confirm your primary contact details and any access notes</li>
        <li style="margin-bottom:8px;">Send through the child enrolment list (or what you have so far)</li>
        <li style="margin-bottom:8px;">Let us know any preferred session days and times</li>
      </ul>
      <p style="padding:12px;background:#FFF3E0;border-radius:6px;border-left:3px solid ${BRAND_ORANGE};">
        <strong>No rush</strong> — even partial info helps us get your first session locked in. Just reply to this email.
      </p>
      <p style="margin-top:24px;">Cheers,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function onboardingHalfwayCheckInEmail(
  centreName: string,
  contactName: string
): { subject: string; html: string } {
  return {
    subject: `Halfway There! — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Great progress — <strong>${centreName}</strong> is now halfway through onboarding with Build Alpha Kids!</p>
      <p>Here's what's already done and what's still ahead:</p>
      <ul style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Centre profile, logo and contacts are sorted</li>
        <li style="margin-bottom:8px;">Child list is in and the client portal is on its way</li>
        <li style="margin-bottom:8px;">Next up: scheduling your first session and assigning a coach</li>
      </ul>
      <p>If anything on your end has changed — staff, days, expectations — now's a great time to flag it so we can adjust before the first session.</p>
      <p style="margin-top:24px;">Cheers,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

export function onboardingCompletionCelebrationEmail(
  centreName: string,
  contactName: string
): { subject: string; html: string } {
  return {
    subject: `You're All Set Up! — ${centreName}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p><strong>${centreName}</strong> is fully onboarded with Build Alpha Kids — congratulations, and thank you for partnering with us!</p>
      <p>Here's what happens from here:</p>
      <ul style="margin:16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Your coach will continue running sessions on your scheduled days</li>
        <li style="margin-bottom:8px;">You'll receive a session summary after every visit through the client portal</li>
        <li style="margin-bottom:8px;">Skill assessments and progress reports will land each term</li>
        <li style="margin-bottom:8px;">Invoices are issued at the end of each billing period</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://app.buildalphakids.com.au" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Open Your Portal</a>
      </div>
      <p>Anything you need, just reply — we're a quick email away.</p>
      <p style="margin-top:24px;">Cheers,<br><strong>The Build Alpha Kids Team</strong></p>
    `),
  };
}

// ========================
// Outbound invoice email templates
// ========================

export function outboundInvoiceEmail(
  contactName: string,
  invoiceNumber: string,
  periodStart: string,
  periodEnd: string,
  totalAmount: string,
  dueDate: string,
  bankDetails: {
    bankName: string;
    bsb: string;
    accountNumber: string;
    accountName: string;
  } | null,
  payOnlineUrl: string | null
): { subject: string; html: string } {
  const bankSection = bankDetails
    ? `
      <p style="margin-top:16px;font-weight:600;">Bank Transfer Details:</p>
      <table role="presentation" style="margin:8px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:120px;">Bank</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.bankName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">BSB</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.bsb}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Account Number</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.accountNumber}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Account Name</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.accountName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Reference</td><td style="padding:4px 8px;font-weight:600;">${invoiceNumber}</td></tr>
      </table>`
    : "";

  const payOnlineButton = payOnlineUrl
    ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${payOnlineUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Pay Online</a>
      </div>`
    : "";

  return {
    subject: `Invoice ${invoiceNumber} — Build Alpha Kids`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Please find attached your invoice for the period <strong>${periodStart} – ${periodEnd}</strong>.</p>
      <table role="presentation" style="margin:16px 0;width:100%;border:1px solid #E5E5E5;border-radius:6px;overflow:hidden;">
        <tr style="background:#F9F9F9;">
          <td style="padding:10px 12px;color:${BRAND_GREY};font-size:12px;font-weight:600;">Invoice Number</td>
          <td style="padding:10px 12px;color:${BRAND_GREY};font-size:12px;font-weight:600;">Amount Due</td>
          <td style="padding:10px 12px;color:${BRAND_GREY};font-size:12px;font-weight:600;">Due Date</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-weight:600;">${invoiceNumber}</td>
          <td style="padding:10px 12px;font-weight:600;color:${BRAND_ORANGE};">${totalAmount}</td>
          <td style="padding:10px 12px;font-weight:600;">${dueDate}</td>
        </tr>
      </table>
      ${bankSection}
      ${payOnlineButton}
      <p style="color:${BRAND_GREY};font-size:13px;">The PDF invoice is attached to this email.</p>
      <p>If you have any questions, please contact us at <a href="mailto:info@buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">info@buildalphakids.com.au</a>.</p>
      <p style="margin-top:24px;">Kind regards,<br><strong>Build Alpha Kids</strong></p>
    `),
  };
}

export function invoiceReminderEmail(
  contactName: string,
  invoiceNumber: string,
  totalAmount: string,
  dueDate: string,
  daysOverdue: number,
  bankDetails: {
    bankName: string;
    bsb: string;
    accountNumber: string;
    accountName: string;
  } | null,
  payOnlineUrl: string | null
): { subject: string; html: string } {
  const isOverdue = daysOverdue > 0;
  const subjectLine = isOverdue
    ? `Overdue: Invoice ${invoiceNumber} — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} past due`
    : `Payment Reminder: Invoice ${invoiceNumber} — Due ${dueDate}`;

  const openingLine = isOverdue
    ? `<p>Your invoice <strong>${invoiceNumber}</strong> for <strong>${totalAmount}</strong> is now <strong>${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue</strong>. The due date was <strong>${dueDate}</strong>.</p>
       <p>We kindly request that payment be made at your earliest convenience to avoid any disruption to services.</p>`
    : `<p>This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> for <strong>${totalAmount}</strong> is due on <strong>${dueDate}</strong>.</p>`;

  const bankSection = bankDetails
    ? `
      <p style="margin-top:16px;font-weight:600;">Bank Transfer Details:</p>
      <table role="presentation" style="margin:8px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:120px;">Bank</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.bankName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">BSB</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.bsb}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Account Number</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.accountNumber}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Account Name</td><td style="padding:4px 8px;font-weight:600;">${bankDetails.accountName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Reference</td><td style="padding:4px 8px;font-weight:600;">${invoiceNumber}</td></tr>
      </table>`
    : "";

  const payOnlineButton = payOnlineUrl
    ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${payOnlineUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;font-size:16px;">Pay Online</a>
      </div>`
    : "";

  return {
    subject: subjectLine,
    html: layout(`
      <p>Hi ${contactName},</p>
      ${openingLine}
      ${bankSection}
      ${payOnlineButton}
      <p>If payment has already been made, please disregard this reminder. Otherwise, feel free to contact us at <a href="mailto:info@buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">info@buildalphakids.com.au</a> if you have any questions.</p>
      <p style="margin-top:24px;">Kind regards,<br><strong>Build Alpha Kids</strong></p>
    `),
  };
}

export function invoicePaymentConfirmationEmail(
  contactName: string,
  invoiceNumber: string,
  amountPaid: string
): { subject: string; html: string } {
  return {
    subject: `Payment Received — Invoice ${invoiceNumber}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Thank you! We've received your payment of <strong>${amountPaid}</strong> for invoice <strong>${invoiceNumber}</strong>.</p>
      <table role="presentation" style="margin:16px 0;width:100%;border:1px solid #E5E5E5;border-radius:6px;overflow:hidden;">
        <tr style="background:#F9F9F9;">
          <td style="padding:10px 12px;color:${BRAND_GREY};font-size:12px;font-weight:600;">Invoice Number</td>
          <td style="padding:10px 12px;color:${BRAND_GREY};font-size:12px;font-weight:600;">Amount Paid</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-weight:600;">${invoiceNumber}</td>
          <td style="padding:10px 12px;font-weight:600;color:${BRAND_ORANGE};">${amountPaid}</td>
        </tr>
      </table>
      <p>No further action is required. We appreciate your prompt payment and look forward to continuing our partnership.</p>
      <p>If you have any questions, please contact us at <a href="mailto:info@buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">info@buildalphakids.com.au</a>.</p>
      <p style="margin-top:24px;">Kind regards,<br><strong>Build Alpha Kids</strong></p>
    `),
  };
}

export function coachPaymentSummaryEmail(
  coachName: string,
  periodStart: string,
  periodEnd: string,
  totalSessions: number,
  totalHours: number,
  subtotal: number,
  adjustments: number,
  total: number,
  adjustmentReason?: string | null
): { subject: string; html: string } {
  const periodLabel = `${periodStart} to ${periodEnd}`;
  return {
    subject: `Payment Summary — ${periodLabel}`,
    html: layout(`
      <p>Hi ${coachName},</p>
      <p>Your payment summary for <strong>${periodLabel}</strong> is ready:</p>
      <table role="presentation" style="margin:16px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:180px;">Sessions Delivered</td><td style="padding:4px 8px;font-weight:600;">${totalSessions}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Total Hours</td><td style="padding:4px 8px;font-weight:600;">${totalHours.toFixed(1)}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Subtotal</td><td style="padding:4px 8px;font-weight:600;">$${subtotal.toFixed(2)}</td></tr>
        ${adjustments !== 0 ? `<tr><td style="padding:4px 8px;color:${BRAND_GREY};">${adjustments > 0 ? "Bonus" : "Deduction"}${adjustmentReason ? ` (${adjustmentReason})` : ""}</td><td style="padding:4px 8px;font-weight:600;">$${adjustments.toFixed(2)}</td></tr>` : ""}
        <tr style="border-top:2px solid ${BRAND_ORANGE};"><td style="padding:8px 8px;color:${BRAND_DARK};font-weight:700;">Total</td><td style="padding:8px 8px;font-weight:700;color:${BRAND_ORANGE};font-size:15px;">$${total.toFixed(2)}</td></tr>
      </table>
      <p>Your full payment summary (including a line-by-line breakdown of each session) is available in your dashboard.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildalphakids.com.au"}/coach/invoicing" style="display:inline-block;padding:12px 24px;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:700;">View Payment Summary</a>
      </div>
      <p style="color:${BRAND_GREY};font-size:12px;">This is a payment summary, not a tax invoice. You are responsible for issuing your own tax invoices and managing your own GST/tax obligations.</p>
    `),
  };
}

export function demoScheduledEmail(
  contactName: string,
  centreName: string,
  date: string,
  time: string,
  coachName: string,
  durationMinutes: number
): { subject: string; html: string } {
  return {
    subject: `Demo Session Confirmed: ${date} at ${time}`,
    html: layout(`
      <p>Hi ${contactName},</p>
      <p>Your demo session with <strong>Build Alpha Kids</strong> has been confirmed:</p>
      <table role="presentation" style="margin:16px 0;width:100%;">
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:120px;">Centre</td><td style="padding:4px 8px;font-weight:600;">${centreName}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Date</td><td style="padding:4px 8px;font-weight:600;">${date}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Time</td><td style="padding:4px 8px;font-weight:600;">${time}</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Duration</td><td style="padding:4px 8px;font-weight:600;">${durationMinutes} minutes</td></tr>
        <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Coach</td><td style="padding:4px 8px;font-weight:600;">${coachName}</td></tr>
      </table>
      <p>We look forward to showing you what Build Alpha Kids can do for your students. If you need to reschedule, please get in touch.</p>
      <p style="color:${BRAND_GREY};font-size:13px;">Questions? Reply to this email or contact us at <a href="mailto:info@buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">info@buildalphakids.com.au</a>.</p>
    `),
  };
}

/**
 * Escapes user-supplied text for interpolation into email HTML.
 *
 * Only the enquiry acknowledgement needs this: every other template in
 * this file is fed by staff-entered or system-generated values, whereas
 * the enquiry form is a public, unauthenticated ingress.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function enquiryAcknowledgementEmail(
  contactName: string | null,
  centreName: string
): { subject: string; html: string } {
  const greeting = contactName?.trim() ? escapeHtml(contactName.trim()) : "there";

  return {
    subject: "Thanks for your enquiry — Build Alpha Kids",
    html: layout(`
      <p>Hi ${greeting},</p>
      <p>Thanks for getting in touch about <strong>${escapeHtml(centreName)}</strong>. We've received your enquiry and someone from our team will be in touch soon.</p>
      <p>If you'd like to add anything in the meantime, just reply to this email.</p>
      <p style="color:${BRAND_GREY};font-size:13px;">You can also reach us at <a href="mailto:info@buildalphakids.com.au" style="color:${BRAND_ORANGE};text-decoration:none;">info@buildalphakids.com.au</a>.</p>
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
