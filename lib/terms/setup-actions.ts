"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  holidaysWithin,
  inferWeeklyPattern,
  mondayOf,
  plannedSessionDates,
  type InferredEntry,
  type SourceSession,
} from "@/lib/terms/term-setup";

// ============================================================
// Term setup — roll a term forward, then generate the whole term
// ============================================================
// Reads sessions by DATE window (a mislabelled term_id cannot hide the
// pattern — see lib/terms/term-setup.ts). Admin/ops only; the server
// client's RLS enforces that.

export interface TermSetupData {
  term: { id: string; name: string; start_date: string; end_date: string; status: string };
  /** The most recent earlier term that actually ran sessions, by date. */
  source: { id: string; name: string; start_date: string; end_date: string; sessions: number } | null;
  entries: InferredEntry[];
  existingTemplates: number;
  existingSessions: number;
  holidays: Array<{ date: string; name: string }>;
  coaches: Array<{ id: string; name: string }>;
}

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not authenticated." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { supabase, user: null, error: "Insufficient permissions." };
  }
  return { supabase, user, error: null };
}

export async function getTermSetup(termId: string): Promise<{ data: TermSetupData | null; error: string | null }> {
  try {
    const { supabase, error: authErr } = await requireStaff();
    if (authErr) return { data: null, error: authErr };

    const { data: term } = await supabase
      .from("terms")
      .select("id, name, start_date, end_date, status")
      .eq("id", termId)
      .maybeSingle();
    if (!term) return { data: null, error: "Term not found." };

    // Candidate sources: earlier terms, newest first. The first with a
    // live session inside its dates is the one to roll forward.
    const { data: earlier } = await supabase
      .from("terms")
      .select("id, name, start_date, end_date")
      .lt("start_date", term.start_date)
      .order("start_date", { ascending: false });

    let source: TermSetupData["source"] = null;
    let sessions: SourceSession[] = [];
    for (const t of earlier ?? []) {
      const { data: rows } = await supabase
        .from("sessions")
        .select(
          "centre_id, date, time, duration_minutes, sport, status, coach_id, school_class_ids, centres:centre_id(name), profiles:coach_id(name)"
        )
        .gte("date", t.start_date)
        .lte("date", t.end_date)
        .neq("status", "cancelled");
      if (!rows || rows.length === 0) continue;
      sessions = rows.map((r) => ({
        centre_id: r.centre_id as string,
        centre_name: ((r.centres as unknown as { name: string } | null)?.name as string) ?? "Unknown",
        date: r.date as string,
        time: r.time as string,
        duration_minutes: r.duration_minutes as number,
        sport: r.sport as string,
        status: r.status as string,
        coach_id: (r.coach_id as string | null) ?? null,
        coach_name: ((r.profiles as unknown as { name: string } | null)?.name as string | undefined) ?? null,
        school_class_ids: ((r as Record<string, unknown>).school_class_ids as string[] | null) ?? null,
      }));
      source = { id: t.id, name: t.name, start_date: t.start_date, end_date: t.end_date, sessions: rows.length };
      break;
    }

    const [{ count: existingTemplates }, { count: existingSessions }, { data: coaches }] = await Promise.all([
      supabase.from("term_templates").select("id", { count: "exact", head: true }).eq("term_id", term.id),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("date", term.start_date)
        .lte("date", term.end_date)
        .neq("status", "cancelled"),
      supabase.from("profiles").select("id, name").eq("role", "coach").eq("status", "active").order("name"),
    ]);

    return {
      data: {
        term,
        source,
        entries: inferWeeklyPattern(sessions),
        existingTemplates: existingTemplates ?? 0,
        existingSessions: existingSessions ?? 0,
        holidays: holidaysWithin(term.start_date, term.end_date),
        coaches: (coaches ?? []) as Array<{ id: string; name: string }>,
      },
      error: null,
    };
  } catch (err) {
    console.error("getTermSetup error:", err);
    return { data: null, error: "Failed to load the term setup." };
  }
}

export interface SetupEntryInput {
  centre_id: string;
  day_of_week: number;
  time: string; // "HH:MM"
  duration_minutes: number;
  sport: string;
  coach_id: string | null;
  school_class_ids: string[] | null;
}

/**
 * Write the chosen slots as the term's templates. Slots the term already
 * has (same centre, weekday, time, sport) are left alone, so running
 * setup twice never doubles a centre up.
 */
export async function applyTermSetup(
  termId: string,
  entries: SetupEntryInput[]
): Promise<{ data: { created: number; skipped: number } | null; error: string | null }> {
  try {
    const { supabase, user, error: authErr } = await requireStaff();
    if (authErr || !user) return { data: null, error: authErr };

    const clean = entries.filter(
      (e) =>
        /^[0-9a-f-]{36}$/.test(e.centre_id) &&
        e.day_of_week >= 1 &&
        e.day_of_week <= 5 &&
        /^\d{2}:\d{2}$/.test(e.time) &&
        e.duration_minutes > 0 &&
        e.sport.trim().length > 0
    );
    if (clean.length === 0) return { data: null, error: "Nothing to add." };

    const { data: existing } = await supabase
      .from("term_templates")
      .select("centre_id, day_of_week, time, sport")
      .eq("term_id", termId);
    const have = new Set((existing ?? []).map((t) => `${t.centre_id}|${t.day_of_week}|${String(t.time).slice(0, 5)}|${t.sport}`));

    const rows = clean
      .filter((e) => !have.has(`${e.centre_id}|${e.day_of_week}|${e.time}|${e.sport}`))
      .map((e) => ({
        term_id: termId,
        day_of_week: e.day_of_week,
        time: e.time,
        duration_minutes: e.duration_minutes,
        centre_id: e.centre_id,
        sport: e.sport.trim(),
        default_coach_id: e.coach_id,
        school_class_ids: e.school_class_ids,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from("term_templates").insert(rows);
      if (error) throw error;
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "term_templates_rolled_forward",
      entity_type: "term",
      entity_id: termId,
      metadata: { created: rows.length, skipped: clean.length - rows.length },
    });
    revalidatePath("/admin/roster/terms");
    revalidatePath("/ops/roster/terms");
    return { data: { created: rows.length, skipped: clean.length - rows.length }, error: null };
  } catch (err) {
    console.error("applyTermSetup error:", err);
    return { data: null, error: "Failed to save the templates." };
  }
}

/**
 * Generate every week of the term from its templates in one go — draft
 * sessions, clipped to the term's dates, skipping the given dates and
 * anything already generated. `dryRun` returns the count only.
 */
export async function generateSessionsForTerm(input: {
  termId: string;
  skipDates: string[];
  dryRun?: boolean;
}): Promise<{ data: { planned: number; created: number; weeks: number } | null; error: string | null }> {
  try {
    const { supabase, user, error: authErr } = await requireStaff();
    if (authErr || !user) return { data: null, error: authErr };

    const { data: term } = await supabase
      .from("terms")
      .select("id, start_date, end_date")
      .eq("id", input.termId)
      .maybeSingle();
    if (!term) return { data: null, error: "Term not found." };

    const [{ data: templates }, { data: existing }] = await Promise.all([
      supabase.from("term_templates").select("*").eq("term_id", term.id),
      supabase
        .from("sessions")
        .select("template_id, date")
        .eq("term_id", term.id)
        .not("template_id", "is", null),
    ]);
    if (!templates || templates.length === 0) return { data: null, error: "This term has no templates yet." };

    const skip = input.skipDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const planned = plannedSessionDates(
      templates.map((t) => ({ id: t.id as string, day_of_week: t.day_of_week as number })),
      term,
      skip,
      (existing ?? []).map((s) => `${s.template_id}_${s.date}`)
    );
    const weeks = new Set(planned.map((p) => mondayOf(p.date))).size;
    if (input.dryRun) return { data: { planned: planned.length, created: 0, weeks }, error: null };

    const byId = new Map(templates.map((t) => [t.id as string, t]));
    const rows = planned.map(({ template_id, date }) => {
      const tpl = byId.get(template_id)!;
      return {
        term_id: term.id,
        template_id,
        date,
        time: tpl.time,
        duration_minutes: tpl.duration_minutes,
        centre_id: tpl.centre_id,
        coach_id: tpl.default_coach_id,
        sport: tpl.sport,
        status: "draft",
        school_class_ids: (tpl as Record<string, unknown>).school_class_ids ?? null,
      };
    });
    // Batches keep one request well under PostgREST's payload limits.
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("sessions").insert(rows.slice(i, i + 200));
      if (error) throw error;
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "term_sessions_generated",
      entity_type: "term",
      entity_id: term.id,
      metadata: { created: rows.length, skipped_dates: skip },
    });
    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");
    return { data: { planned: planned.length, created: rows.length, weeks }, error: null };
  } catch (err) {
    console.error("generateSessionsForTerm error:", err);
    return { data: null, error: "Failed to generate the term." };
  }
}
