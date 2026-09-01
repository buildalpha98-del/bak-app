"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { sendEmailWithAttachment } from "@/lib/email/send";
import { reportDeliveryEmail } from "@/lib/reports/email-template";
import { ReportPDF } from "@/lib/reports/pdf-template";
import { getReportDetail, markReportSent } from "@/lib/reports/actions";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

// ============================================================
// Send report as PDF via email
// ============================================================

export async function sendReportEmail(
  reportId: string,
  recipientEmail: string
): Promise<{ error: string | null }> {
  try {
    const { data: report, error: fetchError } = await getReportDetail(reportId);
    if (fetchError || !report) {
      return { error: fetchError ?? "Report not found." };
    }

    const isWhiteLabel = report.centre_branding_mode === "white_label";

    // Generate PDF buffer
    const pdfBuffer = await renderToBuffer(
      ReportPDF({
        title: report.title,
        centreName: report.centre_name,
        termName: report.term_name,
        content: report.content_json,
        branding: {
          mode: isWhiteLabel ? "white_label" : "bak_branded",
          logoUrl: report.centre_logo_url,
          primaryColour: isWhiteLabel
            ? (report.centre_brand_colour ?? undefined)
            : undefined,
        },
        generatedDate: new Date().toLocaleDateString("en-AU", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: SYDNEY_TZ,
        }),
      })
    );

    // Build email
    const brandName = isWhiteLabel
      ? report.centre_name
      : "Build Alpha Kids";

    const { subject, html } = reportDeliveryEmail(
      report.centre_name,
      report.term_name,
      brandName
    );

    const filename = `${report.centre_name.replace(/[^a-zA-Z0-9]/g, "-")}-${report.term_name.replace(/[^a-zA-Z0-9]/g, "-")}-Report.pdf`;

    const { success, error: sendError } = await sendEmailWithAttachment(
      recipientEmail,
      subject,
      html,
      {
        filename,
        content: Buffer.from(pdfBuffer),
      }
    );

    if (!success) {
      return { error: sendError ?? "Failed to send email." };
    }

    // Mark as sent
    await markReportSent(reportId, [recipientEmail]);

    return { error: null };
  } catch (err) {
    console.error("sendReportEmail error:", err);
    return { error: "Failed to send report." };
  }
}
