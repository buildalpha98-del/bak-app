import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  StudentReportPDF,
  type StudentReportData,
} from "@/lib/reports/student-pdf-template";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";
import { yearGroupLabel } from "@/lib/schools/year-groups";

// Per-student report card. Everything is read through the caller's
// cookie client, so RLS decides what a portal user can put in a PDF —
// same trust model as the centre report download.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: SYDNEY_TZ,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;
  const childId = new URL(request.url).searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Enrolment check doubles as the access check: RLS only returns the
  // row when the caller can see this centre's enrolments.
  const { data: enrolment } = await supabase
    .from("centre_children")
    .select("child_id, children!inner(first_name, last_name)")
    .eq("centre_id", centreId)
    .eq("child_id", childId)
    .eq("status", "active")
    .maybeSingle();
  if (!enrolment) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  const child = enrolment.children as unknown as {
    first_name: string;
    last_name: string;
  };

  const { data: centre } = await supabase
    .from("centres")
    .select("name, branding_mode, logo_url")
    .eq("id", centreId)
    .maybeSingle();

  // The report covers the term of the child's most recent assessment
  // (falling back to the latest term with completed sessions), and
  // compares marks against the term before it.
  const { data: ratings } = await supabase
    .from("skill_ratings")
    .select(
      "term_id, ratings_json, assessed_at, terms!inner(name, start_date, end_date), assessment_templates!inner(sport, centre_id)"
    )
    .eq("child_id", childId)
    .order("assessed_at", { ascending: false });

  const scoped = (ratings ?? []).filter((r) => {
    const t = r.assessment_templates as unknown as { centre_id: string | null };
    return t.centre_id === centreId || t.centre_id === null;
  });
  if (scoped.length === 0) {
    return NextResponse.json(
      { error: "No assessments recorded for this student yet" },
      { status: 404 }
    );
  }

  type TermInfo = { name: string; start_date: string; end_date: string };
  const reportTermId = scoped[0].term_id as string;
  const reportTerm = scoped[0].terms as unknown as TermInfo;
  const previousTermIds = Array.from(
    new Set(scoped.filter((r) => r.term_id !== reportTermId).map((r) => r.term_id))
  );

  // Previous marks per skill (highest across sports, matching the
  // portal's Progression tab logic).
  const prevMarks = new Map<string, number>();
  for (const r of scoped.filter((x) => previousTermIds[0] && x.term_id === previousTermIds[0])) {
    for (const s of (r.ratings_json as { skill_name: string; rating: number }[]) ?? []) {
      prevMarks.set(s.skill_name, Math.max(prevMarks.get(s.skill_name) ?? 0, s.rating));
    }
  }

  const assessments: StudentReportData["assessments"] = scoped
    .filter((r) => r.term_id === reportTermId)
    .map((r) => {
      const tpl = r.assessment_templates as unknown as { sport: string };
      return {
        sport: tpl.sport,
        assessedAt: fmtDate(r.assessed_at as string),
        skills: ((r.ratings_json as { skill_name: string; rating: number }[]) ?? []).map(
          (s) => ({
            name: s.skill_name,
            mark: s.rating,
            previousMark: prevMarks.get(s.skill_name) ?? null,
          })
        ),
      };
    })
    .sort((a, b) => a.sport.localeCompare(b.sport));

  // Attendance across the report term's completed sessions.
  const { data: termSessions } = await supabase
    .from("sessions")
    .select("id, date, sport, program_id")
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .gte("date", reportTerm.start_date)
    .lte("date", reportTerm.end_date);
  const sessionIds = (termSessions ?? []).map((s) => s.id);

  let attendance: StudentReportData["attendance"] = null;
  if (sessionIds.length > 0) {
    const { data: att } = await supabase
      .from("session_attendances")
      .select("present")
      .eq("child_id", childId)
      .in("session_id", sessionIds);
    if (att && att.length > 0) {
      attendance = {
        attended: att.filter((a) => a.present).length,
        total: att.length,
      };
    }
  }

  // Class + teacher (schools; null for childcare).
  let className: string | null = null;
  let teacherName: string | null = null;
  const { data: membership } = await supabase
    .from("school_class_children")
    .select("school_classes!inner(name, year_group, teacher_name, centre_id)")
    .eq("child_id", childId)
    .is("ended_at", null);
  const cls = (membership ?? [])
    .map((m) => m.school_classes as unknown as {
      name: string;
      year_group: string;
      teacher_name: string | null;
      centre_id: string;
    })
    .find((c) => c.centre_id === centreId);
  if (cls) {
    className = `${cls.name} — ${yearGroupLabel(cls.year_group)}`;
    teacherName = cls.teacher_name;
  }

  // Latest development insight (report term first, else most recent).
  const { data: insights } = await supabase
    .from("child_insights")
    .select("term_id, summary, strengths, areas_for_growth, recommendations, created_at")
    .eq("child_id", childId)
    .order("created_at", { ascending: false });
  const insightRow =
    (insights ?? []).find((i) => i.term_id === reportTermId) ?? (insights ?? [])[0];
  const insight = insightRow
    ? {
        summary: insightRow.summary,
        strengths: insightRow.strengths ?? [],
        areasForGrowth: insightRow.areas_for_growth ?? [],
        recommendations: insightRow.recommendations ?? [],
      }
    : null;

  // Shared coach observations at this centre (coach opt-in only — RLS
  // enforces visible_to_centre for portal users).
  const { data: obsRows } = await supabase
    .from("child_observations")
    .select("observation, sessions!inner(date, sport, centre_id), profiles(name)")
    .eq("child_id", childId)
    .eq("visible_to_centre", true)
    .order("created_at", { ascending: false })
    .limit(3);
  const coachComments = (obsRows ?? [])
    .filter((o) => (o.sessions as unknown as { centre_id: string }).centre_id === centreId)
    .map((o) => {
      const s = o.sessions as unknown as { date: string; sport: string };
      const coach = o.profiles as unknown as { name: string } | null;
      return {
        text: o.observation as string,
        coach: coach?.name ?? null,
        context: `${s.sport}, ${fmtDate(s.date)}`,
      };
    });

  // Curriculum outcomes from the programs of sessions the student
  // attended this term.
  const attendedSessionIds = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: att } = await supabase
      .from("session_attendances")
      .select("session_id, present")
      .eq("child_id", childId)
      .in("session_id", sessionIds)
      .eq("present", true);
    for (const a of att ?? []) attendedSessionIds.add(a.session_id);
  }
  const programIds = Array.from(
    new Set(
      (termSessions ?? [])
        .filter((s) => attendedSessionIds.has(s.id) && s.program_id)
        .map((s) => s.program_id as string)
    )
  );
  const outcomes = new Map<string, string>();
  if (programIds.length > 0) {
    const { data: programs } = await supabase
      .from("programs")
      .select("content_json")
      .in("id", programIds);
    for (const p of programs ?? []) {
      const list = ((p.content_json as Record<string, unknown>)?.curriculumOutcomes ??
        []) as Array<{ code?: string; title?: string }>;
      for (const o of list) {
        if (o.code && !outcomes.has(o.code)) outcomes.set(o.code, o.title ?? "");
      }
    }
  }

  const data: StudentReportData = {
    studentName: `${child.first_name} ${child.last_name}`,
    className,
    teacherName,
    schoolName: centre?.name ?? "Your school",
    termName: reportTerm.name,
    attendance,
    assessments,
    insight,
    coachComments,
    outcomes: Array.from(outcomes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, title]) => ({ code, title })),
    branding: {
      mode: centre?.branding_mode === "white_label" ? "white_label" : "bak_branded",
      logoUrl: centre?.logo_url,
    },
    generatedDate: new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: SYDNEY_TZ,
    }),
  };

  const buffer = await renderToBuffer(StudentReportPDF(data));
  const safeName = data.studentName.replace(/[^a-zA-Z0-9]/g, "-");
  const safeTerm = reportTerm.name.replace(/[^a-zA-Z0-9]/g, "-");

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}-${safeTerm}-Report.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
