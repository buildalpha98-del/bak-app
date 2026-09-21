import { NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getPlanningTerm } from "@/lib/client/term-plan-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateTermPlan } from "@/lib/ai/generate-term-plan";
import { frameworkOf, bandLabelForYearGroup } from "@/lib/curriculum/frameworks";
import { SUBJECTS, isSubjectKey } from "@/lib/curriculum/subjects";
import { yearGroupToStage } from "@/lib/schools/year-groups";
import { isPlannableTerm } from "@/lib/schools/plannable-terms";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { checkDailyLimit, getCached, setCached, hashRequestKey } from "@/lib/ai/cache-and-limit";

// A full programme or term plan can take a couple of minutes to write;
// Vercel's default function budget is shorter than that. The lesson
// generation on production once ran past three minutes.
export const maxDuration = 180;

// Draft a class's term plan (migration 096). Schools only; a class
// teacher may plan only their own classes. One real generation per
// class × subject × term × steer is cached for the day.

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 15_000;
const DAILY_LIMIT = 12;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ centreId: string }> }
) {
  try {
    const { centreId } = await params;
    const { data: clientUser } = await getCurrentClientUser(centreId);
    if (!clientUser || clientUser.is_authorised_for_current === false) {
      return NextResponse.json({ error: "Not authorised." }, { status: 401 });
    }
    if (clientUser.centre_type !== "school") {
      return NextResponse.json({ error: "Term plans are for schools." }, { status: 403 });
    }
    const lastGen = rateLimitMap.get(clientUser.id);
    if (lastGen && Date.now() - lastGen < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: `Please wait ${Math.ceil((RATE_LIMIT_MS - (Date.now() - lastGen)) / 1000)} seconds before generating again.` },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const subjectKey = typeof body.subject === "string" ? body.subject : "";
    const classId = typeof body.classId === "string" ? body.classId : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 400) : "";
    if (!isSubjectKey(subjectKey)) return NextResponse.json({ error: "Pick a subject." }, { status: 400 });
    if (!classId) return NextResponse.json({ error: "Pick a class." }, { status: 400 });
    if (clientUser.class_ids.length > 0 && !clientUser.class_ids.includes(classId)) {
      return NextResponse.json({ error: "That class is not one of yours." }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: cls } = await supabase
      .from("school_classes")
      .select("id, name, year_group")
      .eq("id", classId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });
    const term = await getPlanningTerm(typeof body.termId === "string" ? body.termId : undefined);
    if (!term) return NextResponse.json({ error: "No active term to plan." }, { status: 400 });
    if (!isPlannableTerm(term, sydneyTodayIso())) return NextResponse.json({ error: `${term.name} is over — pick this term or a coming one.` }, { status: 400 });

    const framework = frameworkOf(clientUser.centre_framework);
    const subject = SUBJECTS[subjectKey];
    const band = yearGroupToStage(cls.year_group);
    if (!band) return NextResponse.json({ error: "That class has no year group to plan for." }, { status: 400 });
    const bandLabel = bandLabelForYearGroup(framework, cls.year_group) ?? band;
    const termNumber = Number(/term\s*(\d)/i.exec(term.name)?.[1] ?? "") || null;

    const cacheKey = hashRequestKey("term-plan", {
      framework: framework.key,
      subject: subject.key,
      classId,
      termId: term.id,
      weekCount: term.weekCount,
      notes,
    });
    const cached = getCached<unknown>(cacheKey);
    if (cached) return NextResponse.json({ data: cached, cached: true });

    const daily = checkDailyLimit(`term-plan:${clientUser.id}`, DAILY_LIMIT);
    if (!daily.allowed) {
      return NextResponse.json({ error: `Daily term-plan limit reached (${DAILY_LIMIT}/day).` }, { status: 429 });
    }
    rateLimitMap.set(clientUser.id, Date.now());

    const result = await generateTermPlan({
      framework,
      subject,
      bands: [band],
      bandLabel,
      yearGroups: [cls.year_group],
      className: cls.name,
      termName: term.name,
      termNumber,
      weekCount: term.weekCount,
      on: term.start_date,
      notes: notes || undefined,
    });
    const payload = { ...result, termId: term.id, termName: term.name, className: cls.name, classId: cls.id };
    setCached(cacheKey, payload);
    return NextResponse.json({ data: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate the term plan.";
    console.error("Term plan generation error:", message);
    if (message.includes("ANTHROPIC_API_KEY") || message.includes("api_key")) {
      return NextResponse.json({ error: "AI service is not available right now." }, { status: 503 });
    }
    if (message.includes("rate_limit") || message.includes("429") || message.includes("overloaded")) {
      return NextResponse.json({ error: "AI service is busy — try again in a minute." }, { status: 429 });
    }
    return NextResponse.json(
      { error: message.includes("cut off") ? message : "Failed to generate the term plan. Please try again." },
      { status: 500 }
    );
  }
}
