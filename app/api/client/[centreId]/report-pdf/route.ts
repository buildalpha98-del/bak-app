import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportPdfDocument } from "@/components/client/report-pdf-template";
import React from "react";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId");

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Auth check
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Fetch report with centre and term details
  const { data: report, error } = await supabase
    .from("centre_reports")
    .select(
      `id, content_json, created_at,
       centres!centre_reports_centre_id_fkey(name),
       terms!centre_reports_term_id_fkey(name, start_date, end_date)`
    )
    .eq("id", reportId)
    .eq("centre_id", centreId)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const content = (report.content_json ?? {}) as Record<string, unknown>;
  const centreName =
    (report.centres as { name?: string } | null)?.name ?? "Your Centre";
  const termData = report.terms as { name?: string } | null;
  const termName = termData?.name ?? "Term Report";

  const generatedAt = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const pdfProps = {
    centreName,
    termName,
    summary: typeof content.summary === "string" ? content.summary : "",
    sessionsDelivered:
      typeof content.sessions_delivered === "number"
        ? content.sessions_delivered
        : Number(content.sessions_delivered ?? 0),
    averageRating:
      typeof content.average_rating === "number"
        ? content.average_rating
        : Number(content.average_rating ?? 0),
    sportsCovered: Array.isArray(content.sports_covered)
      ? (content.sports_covered as string[])
      : [],
    highlights: Array.isArray(content.highlights)
      ? (content.highlights as string[])
      : [],
    generatedAt,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(
    React.createElement(ReportPdfDocument, { report: pdfProps }) as any
  );

  const safeTerm = termName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-");

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="BAK-Report-${safeTerm}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
