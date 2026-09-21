"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { weekNumberFor } from "@/lib/schools/term-weeks";
import { briefForWeek, leadPlanClassId, planSessionState, type PlanSessionState } from "@/lib/curriculum/plan-roster";
import type { TermPlanJson } from "@/lib/curriculum/term-plan";

// ============================================================
// The approved PDHPE term plan drives the roster (migration 098)
// ============================================================
// Preview only. The writing happens one session per request in
// /api/ai/generate-plan-session — a generation takes a minute or more,
// so a whole term cannot ride on one server action.

export interface PlanRosterSession {
  id: string;
  date: string;
  time: string | null;
  sport: string;
  week: number | null;
  focus: string | null;
  unitTitle: string | null;
  state: PlanSessionState;
  programTitle: string | null;
  /** Other classes sharing the session (the plan's class leads). */
  sharedWith: string[];
}

export interface PlanRosterPlan {
  planId: string;
  planTitle: string;
  centreId: string;
  centreName: string;
  className: string;
  sessions: PlanRosterSession[];
}

export async function getPlanRosterPreview(input: {
  termId: string;
  centreId?: string | null;
}): Promise<{ data: PlanRosterPlan[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { data: null, error: "Insufficient permissions." };
    }

    const { data: term } = await supabase
      .from("terms")
      .select("id, start_date, end_date")
      .eq("id", input.termId)
      .maybeSingle();
    if (!term) return { data: null, error: "Term not found." };

    let planQuery = supabase
      .from("term_plans")
      .select("id, title, centre_id, school_class_id, content_json")
      .eq("term_id", input.termId)
      .eq("subject", "pdhpe")
      .eq("status", "approved");
    if (input.centreId) planQuery = planQuery.eq("centre_id", input.centreId);
    const { data: plans, error: planErr } = await planQuery;
    if (planErr) return { data: null, error: planErr.message };
    if (!plans || plans.length === 0) return { data: [], error: null };

    const centreIds = [...new Set(plans.map((p) => p.centre_id as string))];
    const [{ data: centres }, { data: classes }, { data: sessions }] = await Promise.all([
      supabase.from("centres").select("id, name").in("id", centreIds),
      supabase.from("school_classes").select("id, name").in("centre_id", centreIds),
      supabase
        .from("sessions")
        .select("id, date, time, sport, status, centre_id, school_class_ids, program_id")
        .eq("term_id", input.termId)
        .in("centre_id", centreIds)
        .order("date")
        .order("time"),
    ]);

    const programIds = [...new Set((sessions ?? []).map((s) => s.program_id as string | null).filter(Boolean))] as string[];
    const { data: programs } = programIds.length
      ? await supabase.from("programs").select("id, content_json, term_plan_id, term_plan_week").in("id", programIds)
      : { data: [] as Array<{ id: string; content_json: unknown; term_plan_id: string | null; term_plan_week: number | null }> };

    const centreName = new Map((centres ?? []).map((c) => [c.id as string, c.name as string]));
    const className = new Map((classes ?? []).map((c) => [c.id as string, c.name as string]));
    const programById = new Map((programs ?? []).map((p) => [p.id as string, p]));

    const result: PlanRosterPlan[] = [];
    for (const centreId of centreIds) {
      const centrePlans = plans.filter((p) => p.centre_id === centreId);
      const planClassIds = new Set(centrePlans.map((p) => p.school_class_id as string));
      for (const plan of centrePlans) {
        const content = plan.content_json as unknown as TermPlanJson;
        const rows: PlanRosterSession[] = [];
        for (const s of sessions ?? []) {
          if (s.centre_id !== centreId) continue;
          const classIds = ((s as Record<string, unknown>).school_class_ids as string[] | null) ?? [];
          if (leadPlanClassId(classIds, planClassIds) !== plan.school_class_id) continue;
          const week = weekNumberFor(term.start_date as string, term.end_date as string, s.date as string);
          const brief = week === null ? null : briefForWeek(content, week);
          const program = s.program_id ? programById.get(s.program_id as string) : undefined;
          rows.push({
            id: s.id as string,
            date: s.date as string,
            time: (s.time as string | null) ?? null,
            sport: s.sport as string,
            week,
            focus: brief?.focus ?? null,
            unitTitle: brief?.unitTitle ?? null,
            state: planSessionState({
              status: s.status as string,
              programId: (s.program_id as string | null) ?? null,
              programPlanId: program?.term_plan_id ?? null,
              programPlanWeek: program?.term_plan_week ?? null,
              planId: plan.id as string,
              week,
              hasBrief: brief !== null,
            }),
            programTitle: ((program?.content_json as Record<string, unknown> | undefined)?.title as string | undefined) ?? null,
            sharedWith: classIds
              .filter((id) => id !== plan.school_class_id)
              .map((id) => className.get(id) ?? "another class"),
          });
        }
        result.push({
          planId: plan.id as string,
          planTitle: plan.title as string,
          centreId,
          centreName: centreName.get(centreId) ?? "Unknown",
          className: className.get(plan.school_class_id as string) ?? "Class",
          sessions: rows,
        });
      }
    }
    return { data: result, error: null };
  } catch (err) {
    console.error("getPlanRosterPreview error:", err);
    return { data: null, error: "Failed to load the term plans." };
  }
}
