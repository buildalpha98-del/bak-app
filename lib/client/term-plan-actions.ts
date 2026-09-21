"use server";

// Term plans (migration 096): a school's AI-drafted Scope & Sequence per
// class × subject × term. Reads through the cookie client (RLS: own
// school); writes through the admin client after the portal auth check,
// as every portal write does.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentClientUser } from "@/lib/client/actions";
import { isSubjectKey } from "@/lib/curriculum/subjects";
import { isTermPlanJson, normaliseTermPlan, type TermPlanJson } from "@/lib/curriculum/term-plan";
import { termWeeks } from "@/lib/schools/term-weeks";
import { frameworkOf, bandLabelForYearGroup, type YearBand } from "@/lib/curriculum/frameworks";
import { outcomesFor } from "@/lib/curriculum/knowledge-base";
import { yearGroupToStage } from "@/lib/schools/year-groups";

export interface SchoolTermPlan {
  id: string;
  class_id: string;
  class_name: string;
  year_group: string;
  subject: string;
  term_id: string;
  title: string;
  status: "draft" | "approved";
  plan: TermPlanJson;
  author_name: string | null;
  updated_at: string;
  /** The band's outcomes under the school's framework — the editor's picker. */
  outcome_options: Array<{ code: string; statement: string }>;
  /** Coach sessions whose programme was written from this plan (098). */
  coach_sessions: PlanCoachSession[];
}

export interface PlanCoachSession {
  week: number;
  session_id: string;
  date: string;
  sport: string;
  program_title: string;
}

export interface TermPlanTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  weekCount: number;
  /** Week-start dates, so a unit's week can prefill a lesson's placement. */
  weekStarts: string[];
}

async function requirePortalUser(centreId: string) {
  const { data: clientUser, error } = await getCurrentClientUser(centreId);
  if (error || !clientUser || clientUser.is_authorised_for_current === false) return null;
  if (clientUser.centre_type !== "school") return null;
  return clientUser;
}

/** The active term (or a given one) as the planner sees it. */
export async function getPlanningTerm(termId?: string): Promise<TermPlanTerm | null> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("terms").select("id, name, start_date, end_date");
  q = termId ? q.eq("id", termId) : q.eq("status", "active");
  const { data: term } = await q.limit(1).maybeSingle();
  if (!term) return null;
  const weeks = termWeeks(term.start_date, term.end_date);
  return {
    id: term.id,
    name: term.name,
    start_date: term.start_date,
    end_date: term.end_date,
    weekCount: weeks.length,
    weekStarts: weeks.map((w) => w.weekStart),
  };
}

/** Saved plans for a school this term, scoped to a teacher's classes. */
export async function getTermPlans(
  centreId: string,
  termId?: string
): Promise<{ term: TermPlanTerm | null; plans: SchoolTermPlan[]; error: string | null }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { term: null, plans: [], error: "Not authorised." };
    const term = await getPlanningTerm(termId);
    if (!term) return { term: null, plans: [], error: null };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("term_plans")
      .select(
        "id, school_class_id, subject, term_id, title, status, content_json, updated_at, created_by_client_user_id, school_classes!inner(name, year_group)"
      )
      .eq("centre_id", centreId)
      .eq("term_id", term.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const authorIds = Array.from(new Set((data ?? []).map((p) => p.created_by_client_user_id).filter(Boolean))) as string[];
    const authorName = new Map<string, string>();
    if (authorIds.length) {
      const { data: authors } = await supabase.from("client_users").select("id, name").in("id", authorIds);
      for (const a of authors ?? []) authorName.set(a.id, a.name);
    }

    // Coach sessions written from these plans. Clients read a programme
    // through the session that carries it (client_read_centre_programs).
    const coachSessions = new Map<string, PlanCoachSession[]>();
    const { data: sessionRows } = await supabase
      .from("sessions")
      .select("id, date, sport, status, programs!inner(term_plan_id, term_plan_week, content_json)")
      .eq("centre_id", centreId)
      .eq("term_id", term.id)
      .neq("status", "cancelled")
      .not("programs.term_plan_id", "is", null)
      .order("date");
    for (const s of sessionRows ?? []) {
      const prog = s.programs as unknown as { term_plan_id: string; term_plan_week: number | null; content_json: { title?: string } | null };
      if (!prog?.term_plan_id || !prog.term_plan_week) continue;
      const list = coachSessions.get(prog.term_plan_id) ?? [];
      list.push({
        week: prog.term_plan_week,
        session_id: s.id,
        date: s.date,
        sport: s.sport,
        program_title: prog.content_json?.title ?? `${s.sport} session`,
      });
      coachSessions.set(prog.term_plan_id, list);
    }

    const framework = frameworkOf(clientUser.centre_framework);
    const plans: SchoolTermPlan[] = [];
    for (const p of data ?? []) {
      if (clientUser.class_ids.length > 0 && !clientUser.class_ids.includes(p.school_class_id)) continue;
      if (!isTermPlanJson(p.content_json)) continue;
      const cls = p.school_classes as unknown as { name: string; year_group: string };
      const band = yearGroupToStage(cls.year_group);
      const outcome_options = band && isSubjectKey(p.subject)
        ? outcomesFor({ framework, subject: p.subject, bands: [band] }).map((o) => ({ code: o.code, statement: o.statement }))
        : [];
      plans.push({
        coach_sessions: coachSessions.get(p.id) ?? [],
        outcome_options,
        id: p.id,
        class_id: p.school_class_id,
        class_name: cls.name,
        year_group: cls.year_group,
        subject: p.subject,
        term_id: p.term_id,
        title: p.title,
        status: p.status === "approved" ? "approved" : "draft",
        plan: p.content_json,
        author_name: p.created_by_client_user_id ? authorName.get(p.created_by_client_user_id) ?? null : null,
        updated_at: p.updated_at,
      });
    }
    return { term, plans, error: null };
  } catch (err) {
    console.error("getTermPlans error:", err);
    return { term: null, plans: [], error: "Failed to load term plans." };
  }
}

/** Save (or replace) the plan for a class × subject × term. */
export async function saveTermPlan(
  centreId: string,
  input: { classId: string; subject: string; termId: string; plan: TermPlanJson }
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { data: null, error: "Not authorised." };
    if (!isSubjectKey(input.subject)) return { data: null, error: "Pick a subject." };
    if (!isTermPlanJson(input.plan) || input.plan.units.length === 0) {
      return { data: null, error: "The plan has no units to save." };
    }
    if (clientUser.class_ids.length > 0 && !clientUser.class_ids.includes(input.classId)) {
      return { data: null, error: "That class is not one of yours." };
    }
    const supabase = await createSupabaseServerClient();
    const { data: cls } = await supabase
      .from("school_classes")
      .select("id")
      .eq("id", input.classId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!cls) return { data: null, error: "Class not found." };

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("term_plans")
      .upsert(
        {
          centre_id: centreId,
          school_class_id: input.classId,
          term_id: input.termId,
          subject: input.subject,
          title: input.plan.title,
          content_json: input.plan as unknown as Record<string, unknown>,
          status: "draft",
          created_by_client_user_id: clientUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "centre_id,school_class_id,term_id,subject" }
      )
      .select("id")
      .single();
    if (error) throw error;

    await admin.from("activity_log").insert({
      user_id: null,
      action: "term_plan_saved",
      entity_type: "term_plan",
      entity_id: data.id,
      metadata: { centre_id: centreId, client_user_id: clientUser.id, subject: input.subject, class_id: input.classId },
    });
    revalidatePath(`/client/${centreId}/curriculum`);
    return { data: { id: data.id }, error: null };
  } catch (err) {
    console.error("saveTermPlan error:", err);
    return { data: null, error: "Failed to save the term plan." };
  }
}

/**
 * A teacher's in-place edit of a saved plan. The edited plan is put
 * through the same normalisation as a fresh draft (codes validated
 * against the knowledge base, weeks checked); a plan with issues is
 * refused. Any edit returns an approved plan to draft — the principal
 * approves the new version.
 */
export async function updateTermPlan(
  centreId: string,
  planId: string,
  plan: TermPlanJson
): Promise<{ data: { status: "draft" } | null; error: string | null; issues?: string[] }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { data: null, error: "Not authorised." };
    const supabase = await createSupabaseServerClient();
    const { data: row } = await supabase
      .from("term_plans")
      .select("id, school_class_id, subject, term_id, status, school_classes!inner(year_group)")
      .eq("id", planId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!row) return { data: null, error: "Plan not found." };
    if (clientUser.class_ids.length > 0 && !clientUser.class_ids.includes(row.school_class_id)) {
      return { data: null, error: "That class is not one of yours." };
    }
    const term = await getPlanningTerm(row.term_id);
    if (!term) return { data: null, error: "The plan's term no longer exists." };
    const yearGroup = (row.school_classes as unknown as { year_group: string }).year_group;
    const band = yearGroupToStage(yearGroup);
    if (!band) return { data: null, error: "That class has no year group." };
    const framework = frameworkOf(clientUser.centre_framework);
    const bands: YearBand[] = [band];
    const { plan: clean, issues, unknownCodes } = normaliseTermPlan(plan, {
      subject: row.subject,
      bandLabel: bandLabelForYearGroup(framework, yearGroup) ?? band,
      bands,
      weekCount: term.weekCount,
    });
    if (issues.length > 0) {
      return { data: null, error: "The plan still has gaps — fix them before saving.", issues: issues.map((i) => i.detail) };
    }
    if (unknownCodes.length > 0) {
      return { data: null, error: `These codes are not in the syllabus for ${clean.bandLabel}: ${unknownCodes.join(", ")}.` };
    }

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("term_plans")
      .update({
        title: clean.title,
        content_json: clean as unknown as Record<string, unknown>,
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("centre_id", centreId);
    if (error) throw error;

    await admin.from("activity_log").insert({
      user_id: null,
      action: "term_plan_edited",
      entity_type: "term_plan",
      entity_id: planId,
      metadata: { centre_id: centreId, client_user_id: clientUser.id, was_approved: row.status === "approved" },
    });
    revalidatePath(`/client/${centreId}/curriculum`);
    return { data: { status: "draft" }, error: null };
  } catch (err) {
    console.error("updateTermPlan error:", err);
    return { data: null, error: "Failed to save your changes." };
  }
}

/** Principal sign-off: the plan becomes the class's programme of record. */
export async function setTermPlanStatus(
  centreId: string,
  planId: string,
  status: "draft" | "approved"
): Promise<{ error: string | null }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { error: "Not authorised." };
    if (!clientUser.is_primary) return { error: "Only the primary contact can approve a term plan." };
    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("term_plans")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("centre_id", centreId);
    if (error) throw error;
    revalidatePath(`/client/${centreId}/curriculum`);
    return { error: null };
  } catch (err) {
    console.error("setTermPlanStatus error:", err);
    return { error: "Failed to update the term plan." };
  }
}

export async function deleteTermPlan(
  centreId: string,
  planId: string
): Promise<{ error: string | null }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { error: "Not authorised." };
    const supabase = await createSupabaseServerClient();
    const { data: plan } = await supabase
      .from("term_plans")
      .select("id, school_class_id, status")
      .eq("id", planId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!plan) return { error: "Plan not found." };
    if (clientUser.class_ids.length > 0 && !clientUser.class_ids.includes(plan.school_class_id)) {
      return { error: "That class is not one of yours." };
    }
    if (plan.status === "approved" && !clientUser.is_primary) {
      return { error: "An approved plan can only be removed by the primary contact." };
    }
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("term_plans").delete().eq("id", planId).eq("centre_id", centreId);
    if (error) throw error;
    revalidatePath(`/client/${centreId}/curriculum`);
    return { error: null };
  } catch (err) {
    console.error("deleteTermPlan error:", err);
    return { error: "Failed to delete the term plan." };
  }
}
