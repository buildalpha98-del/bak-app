import { NextResponse } from "next/server";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { getCurrentClientUser } from "@/lib/client/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateQuiz } from "@/lib/ai/generate-quiz";
import { subjectOf, isSubjectKey } from "@/lib/curriculum/subjects";
import { checkDailyLimit, getCached, setCached, hashRequestKey } from "@/lib/ai/cache-and-limit";

// A quiz for a lesson (programId) or for a focus area + band (migration
// 092). Portal-authenticated, own daily cap.

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000;
const DAILY_LIMIT = 10;
const BANDS = ["3-5", "5-8", "8-12", "12-16"];

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
      return NextResponse.json({ error: "Quizzes are for schools." }, { status: 403 });
    }
    const lastGen = rateLimitMap.get(clientUser.id);
    if (lastGen && Date.now() - lastGen < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: `Please wait ${Math.ceil((RATE_LIMIT_MS - (Date.now() - lastGen)) / 1000)} seconds before generating again.` },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    let subjectKey = typeof body.subject === "string" ? body.subject : "";
    let focus = typeof body.focus === "string" ? body.focus.trim() : "";
    let ageBand = typeof body.ageBand === "string" ? body.ageBand : "";
    let lesson: { title: string; objectives: string[]; activities: string[] } | undefined;
    const programId = typeof body.programId === "string" && body.programId ? body.programId : null;

    if (programId) {
      const supabase = await createSupabaseServerClient();
      const { data: prog } = await supabase
        .from("programs")
        .select("id, subject, sport, age_group, content_json")
        .eq("id", programId)
        .eq("centre_id", centreId)
        .maybeSingle();
      if (!prog) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
      const c = (prog.content_json ?? {}) as Record<string, unknown>;
      subjectKey = prog.subject ?? "pdhpe";
      focus = prog.sport;
      ageBand = prog.age_group ?? ageBand;
      lesson = {
        title: (c.title as string) ?? prog.sport,
        objectives: Array.isArray(c.objectives) ? (c.objectives as string[]).slice(0, 6) : [],
        activities: [
          ...(Array.isArray(c.skillDevelopment) ? (c.skillDevelopment as Array<{ name?: string }>).map((d) => d.name ?? "") : []),
          ((c.modifiedGame as { name?: string } | undefined)?.name ?? ""),
        ].filter(Boolean).slice(0, 6),
      };
    }
    if (!isSubjectKey(subjectKey)) return NextResponse.json({ error: "Pick a subject." }, { status: 400 });
    const subject = subjectOf(subjectKey);
    if (!focus) return NextResponse.json({ error: `Pick a ${subject.strandLabel.toLowerCase()}.` }, { status: 400 });
    if (!BANDS.includes(ageBand)) return NextResponse.json({ error: "Pick a class." }, { status: 400 });

    const cacheKey = hashRequestKey("quiz", { framework: clientUser.centre_framework, programId, subject: subject.key, focus, ageBand });
    const cached = getCached<unknown>(cacheKey);
    if (cached) return NextResponse.json({ data: cached, cached: true });

    const daily = checkDailyLimit(`quiz:${clientUser.id}`, DAILY_LIMIT);
    if (!daily.allowed) {
      return NextResponse.json({ error: `Daily quiz limit reached (${DAILY_LIMIT}/day).` }, { status: 429 });
    }
    rateLimitMap.set(clientUser.id, Date.now());
    const quiz = await generateQuiz({ subject, framework: frameworkOf(clientUser.centre_framework), focus, ageBand, lesson });
    const data = { ...quiz, subject: subject.key, focus, ageBand, programId };
    setCached(cacheKey, data);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate the quiz.";
    console.error("Quiz generation error:", message);
    const status = /rate_limit|429|overloaded/.test(message) ? 429 : /ANTHROPIC_API_KEY|api_key/.test(message) ? 503 : 500;
    return NextResponse.json(
      { error: status === 500 && !/too few/.test(message) ? "Failed to generate the quiz. Please try again." : message },
      { status }
    );
  }
}
