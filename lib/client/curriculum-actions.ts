"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export interface WeeklyProgramEntry {
  weekNumber: number;
  weekStartDate: string;
  sessions: {
    id: string;
    date: string;
    sport: string;
    coach_name: string;
    duration_minutes: number;
    program_title: string | null;
    program_content: Record<string, unknown> | null;
    outcomes: { framework: string; code: string; title: string; description: string }[];
    status: string;
  }[];
}

export async function getScopeAndSequence(
  centreId: string,
  termId?: string
): Promise<{ termName: string; weeks: WeeklyProgramEntry[] }> {
  const supabase = await createSupabaseServerClient();

  // Get term
  let termQuery = supabase.from("terms").select("id, name, start_date, end_date");
  if (termId) {
    termQuery = termQuery.eq("id", termId);
  } else {
    termQuery = termQuery.eq("status", "active");
  }
  const { data: term } = await termQuery.single();
  if (!term) return { termName: "No active term", weeks: [] };

  // Get sessions with programs and coaches
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, date, sport, duration_minutes, status, coach_id,
      program_id, programs(content_json, skill_focus),
      profiles!sessions_coach_id_fkey(name)
    `)
    .eq("centre_id", centreId)
    .eq("term_id", term.id)
    .not("status", "eq", "cancelled")
    .order("date", { ascending: true });

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

    week.sessions.push({
      id: session.id,
      date: session.date,
      sport: session.sport,
      coach_name: (session as any).profiles?.name ?? "TBC",
      duration_minutes: session.duration_minutes,
      program_title: content?.title as string ?? (session as any).programs?.skill_focus ?? null,
      program_content: content,
      outcomes,
      status: session.status,
    });
  }

  weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  return { termName: term.name, weeks };
}

export async function generateSessionReflection(
  sessionId: string,
  centreType: "childcare_centre" | "school"
): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      sport, date, duration_minutes, headcount, coach_notes,
      program_id, programs(content_json, skill_focus)
    `)
    .eq("id", sessionId)
    .single();

  if (!session) return "Session not found.";

  const content = (session as any).programs?.content_json as Record<string, unknown> | null;
  const outcomes = content?.curriculumOutcomes as any[] ?? [];
  const existingReflection = content?.reflectionPrompt as string | undefined;

  // If AI already generated a reflection prompt, return it
  if (existingReflection) return existingReflection;

  // Otherwise generate one now
  const framework = centreType === "childcare_centre" ? "EYLF" : "PDHPE";
  const outcomesText = outcomes.length > 0
    ? outcomes.map((o: any) => `${o.code}: ${o.title}`).join("\n")
    : `General ${framework} physical development outcomes`;

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
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
