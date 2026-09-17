import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getScopeAndSequence } from "@/lib/client/curriculum-actions";
import {
  ScopeSequencePDF,
  type ScopeSequencePdfData,
} from "@/lib/reports/scope-sequence-pdf";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

// The Scope & Sequence as a written document. Data comes through
// getScopeAndSequence, which does its own centre-access check and
// reads via the caller's cookie client — RLS decides every session.

interface SectionOut {
  heading: string;
  name: string;
  description: string;
  bullets: string[];
  tip: string | null;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// Flatten ProgramContentJson (camelCase or legacy snake_case) into
// ordered, labelled sections — warm-up, each drill, game, cool-down.
function programSections(content: Record<string, unknown> | null): SectionOut[] {
  if (!content) return [];
  const out: SectionOut[] = [];
  const push = (
    label: string,
    raw: unknown,
    bulletKeys: string[] = []
  ) => {
    if (!raw || typeof raw !== "object") return;
    const sec = raw as Record<string, unknown>;
    const duration = typeof sec.duration === "number" ? ` · ${sec.duration} min` : "";
    out.push({
      heading: `${label}${duration}`,
      name: asStr(sec.name),
      description: asStr(sec.description),
      bullets: bulletKeys.flatMap((k) => asStrArr(sec[k])),
      tip: asStr(sec.coachingTips ?? sec.coaching_tips) || null,
    });
  };

  push("Warm-up", content.warmUp ?? content.warm_up);
  const drills = (content.skillDevelopment ??
    content.skill_development ??
    content.drills) as unknown;
  if (Array.isArray(drills)) {
    drills.forEach((d, i) =>
      push(`Skill development ${i + 1}`, d, ["progressions"])
    );
  }
  push("Modified game", content.modifiedGame ?? content.modified_game ?? content.game, [
    "rules",
    "variations",
  ]);
  push("Cool-down", content.coolDown ?? content.cool_down);
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const termId = new URL(request.url).searchParams.get("termId") ?? undefined;
  const { termName, weeks } = await getScopeAndSequence(centreId, termId);
  if (weeks.length === 0) {
    return NextResponse.json(
      { error: "No programme data for the current term yet" },
      { status: 404 }
    );
  }

  const { data: centre } = await supabase
    .from("centres")
    .select("name, type, branding_mode, logo_url")
    .eq("id", centreId)
    .maybeSingle();

  const data: ScopeSequencePdfData = {
    centreName: centre?.name ?? "Your centre",
    isSchool: centre?.type === "school",
    termName,
    weeks: weeks.map((w) => ({
      weekNumber: w.weekNumber,
      sessions: w.sessions.map((s) => {
        const content = s.program_content;
        return {
          // Noon UTC is the same calendar day in Sydney — local-midnight
          // parsing on the UTC runtime would render the day before.
          date: new Date(s.date + "T12:00:00Z").toLocaleDateString("en-AU", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: SYDNEY_TZ,
          }),
          sport: s.sport,
          coach_name: s.coach_name,
          duration_minutes: s.duration_minutes,
          program_title: s.program_title,
          stage: s.stage,
          class_names: s.class_names,
          outcomes: (s.outcomes ?? [])
            .filter((o) => o?.code)
            .map((o) => ({ code: o.code, title: o.title ?? "" })),
          objectives: asStrArr(content?.objectives),
          sections: programSections(content),
        };
      }),
    })),
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

  const buffer = await renderToBuffer(ScopeSequencePDF(data));
  const docName = data.isSchool ? "Scope-and-Sequence" : "Weekly-Program-Overview";
  const safeCentre = data.centreName.replace(/[^a-zA-Z0-9]+/g, "-");
  const safeTerm = termName.replace(/[^a-zA-Z0-9]+/g, "-");

  return new NextResponse(Buffer.from(buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeCentre}-${docName}-${safeTerm}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
