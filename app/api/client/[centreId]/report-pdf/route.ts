import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportPDF } from "@/lib/reports/pdf-template";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";
import type { ReportContentJson } from "@/lib/types/database";

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

  // Fetch report with centre branding and term details. RLS scopes this
  // to the caller's centres and, for clients, to status='sent'.
  const { data: report, error } = await supabase
    .from("centre_reports")
    .select(
      `id, title, content_json, created_at,
       centres!centre_reports_centre_id_fkey(name, branding_mode, logo_url),
       terms!centre_reports_term_id_fkey(name, start_date, end_date)`
    )
    .eq("id", reportId)
    .eq("centre_id", centreId)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const centre = report.centres as {
    name?: string;
    branding_mode?: string | null;
    logo_url?: string | null;
  } | null;
  const centreName = centre?.name ?? "Your Centre";
  const termData = report.terms as { name?: string } | null;
  const termName = termData?.name ?? "Term Report";
  const isWhiteLabel = centre?.branding_mode === "white_label";

  // Old rows may carry partial/stringly content — normalise the fields
  // ReportPDF does arithmetic on, pass the rest through untouched.
  const raw = (report.content_json ?? {}) as Record<string, unknown>;
  const content = {
    ...raw,
    sessions_delivered: Number(raw.sessions_delivered ?? 0),
    total_children: Number(raw.total_children ?? 0),
    average_rating:
      raw.average_rating === undefined || raw.average_rating === null
        ? undefined
        : Number(raw.average_rating),
    sports_covered: Array.isArray(raw.sports_covered) ? raw.sports_covered : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    coach_notes: Array.isArray(raw.coach_notes) ? raw.coach_notes : [],
  } as ReportContentJson;

  const generatedAt = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: SYDNEY_TZ,
  });

  // Same template as the emailed report — the portal download and the
  // email must never diverge in sections or branding again.
  const buffer = await renderToBuffer(
    ReportPDF({
      title: (report.title as string | null) ?? `${centreName} — ${termName} Report`,
      centreName,
      termName,
      content,
      branding: {
        mode: isWhiteLabel ? "white_label" : "bak_branded",
        logoUrl: centre?.logo_url,
      },
      generatedDate: generatedAt,
    })
  );

  const safeTerm = termName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-");
  const safeCentre = centreName.replace(/[^a-zA-Z0-9]/g, "-");
  const filename = isWhiteLabel
    ? `${safeCentre}-Report-${safeTerm}.pdf`
    : `BAK-Report-${safeTerm}.pdf`;

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
