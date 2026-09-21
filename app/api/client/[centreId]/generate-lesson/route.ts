import { NextResponse } from "next/server";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentClientUser } from "@/lib/client/actions";
import { generateProgram } from "@/lib/ai/generate-program";
import { validateLessonInput } from "@/lib/client/lesson-input";

// A full programme or term plan can take a couple of minutes to write;
// Vercel's default function budget is shorter than that. The lesson
// generation on production once ran past three minutes.
export const maxDuration = 180;
import {
  checkDailyLimit,
  getCached,
  setCached,
  hashRequestKey,
} from "@/lib/ai/cache-and-limit";

// Teachers generate PDHPE (health), English and Mathematics lessons from the portal
// (migration 091). Same generator as the admin builder, gated on the
// portal user rather than a staff profile, with its own daily cap.

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000;
const DAILY_LIMIT = 10;

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
      return NextResponse.json({ error: "Lessons are for schools." }, { status: 403 });
    }

    const lastGen = rateLimitMap.get(clientUser.id);
    if (lastGen && Date.now() - lastGen < RATE_LIMIT_MS) {
      const waitSeconds = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastGen)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSeconds} seconds before generating again.` },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = validateLessonInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    // The week the lesson is for decides the syllabus (a Term 1 2027 week
    // written this year is a 2024-syllabus PDHPE lesson).
    const on = typeof body.plannedFor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.plannedFor) ? body.plannedFor : undefined;

    const cacheKey = hashRequestKey("lesson", {
      on: on ?? null,
      framework: clientUser.centre_framework,
      classId: input.classId,
      subject: input.subject.key,
      focus: input.focus,
      ageBand: input.ageBand,
      durationMinutes: input.durationMinutes,
      learningFocus: input.learningFocus ?? null,
      resources: [...input.resources].sort(),
    });
    const cached = getCached<unknown>(cacheKey);
    if (cached) return NextResponse.json({ data: cached, cached: true });

    const daily = checkDailyLimit(`lesson:${clientUser.id}`, DAILY_LIMIT);
    if (!daily.allowed) {
      const hoursToReset = Math.ceil((daily.resetAt - Date.now()) / 3_600_000);
      return NextResponse.json(
        { error: `Daily lesson limit reached (${DAILY_LIMIT}/day). Resets in ~${hoursToReset}h.` },
        { status: 429 }
      );
    }

    rateLimitMap.set(clientUser.id, Date.now());
    // The class's year group lets the prompt name the exact stage/level
    // rather than the whole band (a Year 3 lesson gets Level 3 codes).
    let yearGroups: string[] = [];
    if (input.classId) {
      const supabase = await createSupabaseServerClient();
      const { data: cls } = await supabase
        .from("school_classes")
        .select("year_group")
        .eq("id", input.classId)
        .eq("centre_id", centreId)
        .maybeSingle();
      if (cls?.year_group) yearGroups = [cls.year_group];
    }
    const content = await generateProgram({
      subject: input.subject,
      on,
      framework: frameworkOf(clientUser.centre_framework),
      yearGroups,
      sport: input.focus,
      ageGroups: [input.ageBand],
      durationMinutes: input.durationMinutes,
      skillFocus: input.learningFocus,
      availableEquipment: input.resources,
      centreContext: { centreName: clientUser.centre_name, recentPrograms: [] },
    });
    // Headings (and, for PDHPE, lesson-vs-session) key off the strand.
    content.sport = input.focus;
    setCached(cacheKey, content);
    return NextResponse.json({ data: content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate the lesson.";
    console.error("Lesson generation error:", message);
    if (message.includes("ANTHROPIC_API_KEY") || message.includes("api_key")) {
      return NextResponse.json({ error: "AI service is not available right now." }, { status: 503 });
    }
    if (message.includes("rate_limit") || message.includes("429") || message.includes("overloaded")) {
      return NextResponse.json({ error: "AI service is busy — try again in a minute." }, { status: 429 });
    }
    return NextResponse.json(
      { error: message.includes("cut off") ? message : "Failed to generate the lesson. Please try again." },
      { status: 500 }
    );
  }
}
