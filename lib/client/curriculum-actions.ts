"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClientCentreAccess } from "@/lib/client/access";
import {
  ageBandToBandLabel,
  bandLabelForYearGroup,
  bandsLabelForYearGroups,
  frameworkOf,
  type FrameworkKey,
} from "@/lib/curriculum/frameworks";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL } from "@/lib/ai/model";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { weekNumberFor } from "@/lib/schools/term-weeks";

export interface WeeklyProgramEntry {
  weekNumber: number;
  weekStartDate: string;
  sessions: {
    id: string;
    /** A coaching session from the roster, or a teacher's own lesson
     *  placed on the week (migration 093). */
    kind: "session" | "lesson";
    /** Migration 089 subject key ("pdhpe" for every roster session). */
    subject: string;
    date: string;
    sport: string;
    /** Coach name for sessions; the teacher who wrote a lesson. */
    coach_name: string;
    duration_minutes: number;
    program_title: string | null;
    program_content: Record<string, unknown> | null;
    outcomes: { framework: string; code: string; title: string; description: string }[];
    status: string;
    /** Band label in the school's framework ("Stage 2" / "Levels 3–4").
     *  Exact from targeted classes; otherwise an age-band range; null
     *  for childcare/unknown. */
    stage: string | null;
    /** Names of targeted classes ("3B", "3G") when the session is class-scoped. */
    class_names: string[];
  }[];
}

export async function getScopeAndSequence(
  centreId: string,
  termId?: string
): Promise<{ termName: string; weeks: WeeklyProgramEntry[]; frameworkKey: FrameworkKey }> {
  // Server actions are public HTTP endpoints — verify the caller is
  // actually allowed to see this centre before touching data.
  const access = await requireClientCentreAccess(centreId);
  if (!access.authorised) return { termName: "Not authorised", weeks: [], frameworkKey: "nsw" };

  const supabase = await createSupabaseServerClient();

  // Get term
  let termQuery = supabase.from("terms").select("id, name, start_date, end_date");
  if (termId) {
    termQuery = termQuery.eq("id", termId);
  } else {
    termQuery = termQuery.eq("status", "active");
  }
  const [{ data: term }, { data: centreRow }] = await Promise.all([
    termQuery.single(),
    supabase.from("centres").select("curriculum_framework, type").eq("id", centreId).maybeSingle(),
  ]);
  const framework = frameworkOf(centreRow?.curriculum_framework);
  // A multi-band coaching programme carries EYLF lines for its 3-5 band;
  // on a school's Scope & Sequence (and its PDF) only the syllabus codes
  // belong. The programme content itself is left untouched.
  const isSchool = centreRow?.type === "school";
  const schoolOutcomes = (list: unknown[]): WeeklyProgramEntry["sessions"][number]["outcomes"] =>
    ((list ?? []) as WeeklyProgramEntry["sessions"][number]["outcomes"]).filter(
      (o) => !isSchool || !(o?.framework === "eylf" || /^eylf/i.test(String(o?.code ?? "")))
    );
  if (!term) return { termName: "No active term", weeks: [], frameworkKey: framework.key };

  // Get sessions with programs and coaches
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, date, sport, duration_minutes, status, coach_id, school_class_ids,
      program_id, programs(content_json, skill_focus),
      profiles!sessions_coach_id_fkey(name)
    `)
    .eq("centre_id", centreId)
    .eq("term_id", term.id)
    .not("status", "eq", "cancelled")
    .order("date", { ascending: true });

  // Class lookup for stage labelling — one query for the whole term.
  const { data: centreClasses } = await supabase
    .from("school_classes")
    .select("id, name, year_group")
    .eq("centre_id", centreId);
  const classById = new Map(
    (centreClasses ?? []).map((c) => [c.id, { name: c.name, year_group: c.year_group }])
  );

  // Group into weeks
  const weeks: WeeklyProgramEntry[] = [];
  const termStart = new Date(term.start_date);

  for (const session of sessions ?? []) {
    const sessionDate = new Date(session.date);
    const daysDiff = Math.floor((sessionDate.getTime() - termStart.getTime()) / (86400000));
    const weekNum = Math.floor(daysDiff / 7) + 1;

    let week = weeks.find((w) => w.weekNumber === weekNum);
    if (!week) {
      const weekStart = new Date(termStart);
      weekStart.setDate(termStart.getDate() + (weekNum - 1) * 7);
      week = { weekNumber: weekNum, weekStartDate: weekStart.toISOString().slice(0, 10), sessions: [] };
      weeks.push(week);
    }

    const content = (session as any).programs?.content_json as Record<string, unknown> | null;
    const outcomes = content?.curriculumOutcomes as any[] ?? [];

    // Stage: exact from targeted classes, else an age-band range from
    // the programme, else null (childcare / unknown).
    const targeted = ((session as any).school_class_ids as string[] | null ?? [])
      .map((id) => classById.get(id))
      .filter((c): c is { name: string; year_group: string } => !!c);
    const stage =
      targeted.length > 0
        ? bandsLabelForYearGroups(framework, targeted.map((c) => c.year_group))
        : ageBandToBandLabel(
            framework,
            (content?.ageGroup ?? content?.age_group) as string | undefined
          );

    week.sessions.push({
      id: session.id,
      kind: "session",
      subject: (content?.subject as string) ?? "pdhpe",
      date: session.date,
      sport: session.sport,
      coach_name: (session as any).profiles?.name ?? "TBC",
      duration_minutes: session.duration_minutes,
      program_title: content?.title as string ?? (session as any).programs?.skill_focus ?? null,
      program_content: content,
      outcomes: schoolOutcomes(outcomes),
      status: session.status,
      stage,
      class_names: targeted.map((c) => c.name),
    });
  }

  // The school's own lessons placed on a week (migration 093). Read
  // through the cookie client (RLS: own school); author names through
  // the admin client because clients can't read other client_users.
  const { data: lessons } = await supabase
    .from("programs")
    .select("id, subject, sport, duration_minutes, content_json, planned_for, school_class_id, created_by_client_user_id")
    .eq("centre_id", centreId)
    .not("planned_for", "is", null)
    .gte("planned_for", term.start_date)
    .lte("planned_for", term.end_date)
    .order("planned_for", { ascending: true });
  const authorIds = Array.from(new Set((lessons ?? []).map((l) => l.created_by_client_user_id).filter(Boolean))) as string[];
  const { data: authors } = authorIds.length
    ? await createSupabaseAdmin().from("client_users").select("id, name").in("id", authorIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));

  for (const lesson of lessons ?? []) {
    const weekNum = weekNumberFor(term.start_date, term.end_date, lesson.planned_for as string);
    if (weekNum === null) continue;
    let week = weeks.find((w) => w.weekNumber === weekNum);
    if (!week) {
      const weekStart = new Date(termStart);
      weekStart.setDate(termStart.getDate() + (weekNum - 1) * 7);
      week = { weekNumber: weekNum, weekStartDate: weekStart.toISOString().slice(0, 10), sessions: [] };
      weeks.push(week);
    }
    const content = lesson.content_json as Record<string, unknown> | null;
    const cls = lesson.school_class_id ? classById.get(lesson.school_class_id) : undefined;
    week.sessions.push({
      id: lesson.id,
      kind: "lesson",
      subject: lesson.subject ?? "pdhpe",
      date: lesson.planned_for as string,
      sport: lesson.sport,
      coach_name: (lesson.created_by_client_user_id && authorName.get(lesson.created_by_client_user_id)) || "Class teacher",
      duration_minutes: lesson.duration_minutes,
      program_title: ((content?.title as string) ?? lesson.sport) || null,
      program_content: content,
      outcomes: schoolOutcomes((content?.curriculumOutcomes as any[]) ?? []),
      status: "planned",
      stage: cls ? bandLabelForYearGroup(framework, cls.year_group) : ageBandToBandLabel(framework, (content?.ageGroup ?? content?.age_group) as string | undefined),
      class_names: cls ? [cls.name] : [],
    });
    week.sessions.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "session" ? -1 : 1));
  }

  weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  return { termName: term.name, weeks, frameworkKey: framework.key };
}

export async function generateSessionReflection(
  sessionId: string,
  centreType: "childcare_centre" | "school"
): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      sport, date, duration_minutes, headcount, coach_notes, centre_id,
      program_id, programs(content_json, skill_focus)
    `)
    .eq("id", sessionId)
    .single();

  if (!session) return "Session not found.";

  // The session's centre must belong to the caller — otherwise any
  // authenticated user could burn AI tokens on sessions they can't see.
  const access = await requireClientCentreAccess(session.centre_id as string);
  if (!access.authorised) return "Not authorised.";

  const content = (session as any).programs?.content_json as Record<string, unknown> | null;
  const outcomes = content?.curriculumOutcomes as any[] ?? [];
  const existingReflection = content?.reflectionPrompt as string | undefined;

  // If AI already generated a reflection prompt, return it
  if (existingReflection) return existingReflection;

  // Otherwise generate one now
  const { data: centreRow } = await supabase
    .from("centres")
    .select("curriculum_framework")
    .eq("id", session.centre_id)
    .maybeSingle();
  const framework =
    centreType === "childcare_centre" ? "EYLF" : frameworkOf(centreRow?.curriculum_framework).label;
  const outcomesText = outcomes.length > 0
    ? outcomes.map((o: any) => `${o.code}: ${o.title}`).join("\n")
    : `General ${framework} physical development outcomes`;

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1000,
    system: "You are an Australian early childhood / primary school educator writing a brief reflection for your learning journal. Write in first person, past tense, 3-4 sentences. Reference specific activities and curriculum outcomes. Use Australian English.",
    messages: [{
      role: "user",
      content: `Write a reflection prompt for a ${session.sport} session (${session.duration_minutes} min) with ${session.headcount ?? "a group of"} children.

Program: ${content?.title ?? session.sport}
Activities: ${content ? JSON.stringify({ warmUp: (content as any).warmUp?.name, drills: ((content as any).skillDevelopment ?? []).map((d: any) => d.name), game: (content as any).modifiedGame?.name }) : "Standard session"}
Coach notes: ${session.coach_notes ?? "None"}
Outcomes addressed:
${outcomesText}

Write the reflection as if the educator observed the session and is documenting it.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text;
}
