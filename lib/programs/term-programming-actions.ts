"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { autoProgrammeTerm, type AutoProgrammeGroup } from "@/lib/programs/actions";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// ============================================================
// Term programming — is this term's roster programmed, and what's missing?
// ============================================================
//
// The programmes page lists the library; nothing said whether the term
// on the roster had programmes attached. This is the one card that does:
// how many of the term's sessions carry a programme, what Auto-programme
// would attach right now (a dry run of the real thing), the library gaps
// it cannot fill (each a link to generate exactly that series), how many
// school plans are approved and waiting, and what coaches have said
// about the programmes they delivered this term.

export interface TermProgrammingStatus {
  term: { id: string; name: string; start_date: string; end_date: string } | null;
  sessions: number;
  programmed: number;
  /** What Auto-programme would attach now (dry run). */
  auto_ready: number;
  auto_skipped: number;
  /** centre × sport × band groups with no matching programme in the library. */
  gaps: AutoProgrammeGroup[];
  /** Approved PDHPE plans this term, and how many of their sessions still need writing. */
  plans: { approved: number; sessions_ready: number };
  feedback: {
    total: number;
    /** Programmes coaches rated too hard / too easy this term. */
    flagged: Array<{ program_id: string; title: string; too_hard: number; too_easy: number; just_right: number }>;
  };
}

export async function getTermProgrammingStatus(): Promise<{ data: TermProgrammingStatus | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: term } = await supabase
      .from("terms")
      .select("id, name, start_date, end_date")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!term) {
      return {
        data: { term: null, sessions: 0, programmed: 0, auto_ready: 0, auto_skipped: 0, gaps: [], plans: { approved: 0, sessions_ready: 0 }, feedback: { total: 0, flagged: [] } },
        error: null,
      };
    }

    const [{ data: sessions }, auto, { data: plans }, { data: feedback }] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, program_id, centre_id, date, school_class_ids")
        .gte("date", term.start_date)
        .lte("date", term.end_date)
        .neq("status", "cancelled"),
      autoProgrammeTerm({ termId: term.id, dryRun: true }),
      supabase.from("term_plans").select("id, centre_id, school_class_id").eq("term_id", term.id).eq("subject", "pdhpe").eq("status", "approved"),
      supabase
        .from("session_program_feedback")
        .select("program_id, rating, sessions!inner(date), programs:program_id(content_json)")
        .gte("sessions.date", term.start_date)
        .lte("sessions.date", term.end_date),
    ]);

    const live = sessions ?? [];
    const programmed = live.filter((s) => s.program_id).length;

    // Plan-driven sessions still to write: upcoming, unprogrammed, targeting a class with an approved plan.
    const today = sydneyTodayIso();
    const planClasses = new Set((plans ?? []).map((p) => p.school_class_id as string));
    const sessionsReady = live.filter(
      (s) => !s.program_id && (s.date as string) >= today && (((s as Record<string, unknown>).school_class_ids as string[] | null) ?? []).some((id) => planClasses.has(id))
    ).length;

    // Feedback rollup per programme.
    const byProgram = new Map<string, { title: string; too_hard: number; too_easy: number; just_right: number }>();
    for (const f of feedback ?? []) {
      const title = (((f.programs as unknown as { content_json: { title?: string } } | null)?.content_json?.title as string) ?? "Programme");
      const e = byProgram.get(f.program_id as string) ?? { title, too_hard: 0, too_easy: 0, just_right: 0 };
      if (f.rating === "too_hard") e.too_hard++;
      else if (f.rating === "too_easy") e.too_easy++;
      else e.just_right++;
      byProgram.set(f.program_id as string, e);
    }
    const flagged = [...byProgram.entries()]
      .filter(([, e]) => e.too_hard + e.too_easy > 0)
      .map(([program_id, e]) => ({ program_id, ...e }))
      .sort((a, b) => b.too_hard + b.too_easy - (a.too_hard + a.too_easy));

    return {
      data: {
        term,
        sessions: live.length,
        programmed,
        auto_ready: auto.data?.programmed ?? 0,
        auto_skipped: auto.data?.skipped ?? 0,
        gaps: (auto.data?.groups ?? []).filter((g) => g.source_kind === "none"),
        plans: { approved: (plans ?? []).length, sessions_ready: sessionsReady },
        feedback: { total: (feedback ?? []).length, flagged },
      },
      error: null,
    };
  } catch (err) {
    console.error("getTermProgrammingStatus error:", err);
    return { data: null, error: "Failed to load term programming." };
  }
}
