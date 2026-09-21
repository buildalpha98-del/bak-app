import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateProgram } from "@/lib/ai/generate-program";
import { STANDARD_EQUIPMENT } from "@/lib/ai/types";
import { checkDailyLimit } from "@/lib/ai/cache-and-limit";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { SUBJECTS } from "@/lib/curriculum/subjects";
import { briefForWeek, leadPlanClassId } from "@/lib/curriculum/plan-roster";
import type { TermPlanJson } from "@/lib/curriculum/term-plan";
import { weekNumberFor } from "@/lib/schools/term-weeks";
import { yearGroupToAgeBand } from "@/lib/schools/year-groups";

// The approved PDHPE term plan drives the roster (migration 098): write
// ONE rostered session's programme from the plan's week and attach it.
// One session per request — a generation takes a minute or more, so the
// roster dialog walks the term and shows progress, and a failure costs
// one session, not the run.
export const maxDuration = 180;

// Shares the programme generator's per-user daily ceiling.
const DAILY_LIMIT = 30;

const Body = z.object({
  planId: z.string().uuid(),
  sessionId: z.string().uuid(),
  /** Replace a programme the session already carries. */
  replace: z.boolean().optional(),
});

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("Not authenticated.", 401);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return fail("Insufficient permissions.", 403);
    }

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Invalid request.", 400);
    const { planId, sessionId, replace } = parsed.data;

    const [{ data: plan }, { data: session }] = await Promise.all([
      supabase
        .from("term_plans")
        .select("id, centre_id, school_class_id, term_id, subject, status, content_json")
        .eq("id", planId)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("id, date, sport, status, centre_id, term_id, school_class_ids, program_id, duration_minutes")
        .eq("id", sessionId)
        .maybeSingle(),
    ]);
    if (!plan) return fail("Term plan not found.", 404);
    if (!session) return fail("Session not found.", 404);
    if (plan.subject !== "pdhpe") return fail("Only a PDHPE plan drives coaching sessions.", 400);
    if (plan.status !== "approved") return fail("The school has not approved this plan yet.", 409);
    if (session.centre_id !== plan.centre_id || session.term_id !== plan.term_id) {
      return fail("That session is not part of this plan's school and term.", 400);
    }
    if (session.status === "completed" || session.status === "cancelled") {
      return fail("Completed and cancelled sessions are never reprogrammed.", 409);
    }
    if (session.program_id && !replace) {
      return fail("This session already has a programme.", 409);
    }

    // The lead-class rule: where a session targets several classes with
    // approved plans, the first targeted class's plan drives it.
    const sessionClassIds = ((session as Record<string, unknown>).school_class_ids as string[] | null) ?? [];
    const [{ data: centrePlans }, { data: term }, { data: centre }, { data: classes }] = await Promise.all([
      supabase
        .from("term_plans")
        .select("school_class_id")
        .eq("centre_id", plan.centre_id)
        .eq("term_id", plan.term_id)
        .eq("subject", "pdhpe")
        .eq("status", "approved"),
      supabase.from("terms").select("start_date, end_date").eq("id", plan.term_id).maybeSingle(),
      supabase.from("centres").select("name, curriculum_framework").eq("id", plan.centre_id).maybeSingle(),
      sessionClassIds.length
        ? supabase.from("school_classes").select("id, year_group").in("id", sessionClassIds)
        : Promise.resolve({ data: [] as Array<{ id: string; year_group: string }> }),
    ]);
    const lead = leadPlanClassId(sessionClassIds, new Set((centrePlans ?? []).map((p) => p.school_class_id as string)));
    if (lead !== plan.school_class_id) return fail("This session is not driven by that class's plan.", 400);
    if (!term) return fail("Term not found.", 404);

    const week = weekNumberFor(term.start_date as string, term.end_date as string, session.date as string);
    const brief = week === null ? null : briefForWeek(plan.content_json as unknown as TermPlanJson, week);
    if (week === null || !brief) return fail("The plan has nothing for this session's week.", 409);

    // Year groups in the session's own class order (the lead class's
    // stage first), and the age bands they imply.
    const yearByClass = new Map((classes ?? []).map((c) => [c.id as string, c.year_group as string]));
    const yearGroups = sessionClassIds.map((id) => yearByClass.get(id)).filter((y): y is string => Boolean(y));
    const ageGroups = Array.from(new Set(yearGroups.map((y) => yearGroupToAgeBand(y)).filter((b): b is NonNullable<typeof b> => Boolean(b)))).sort();
    if (ageGroups.length === 0) return fail("The session's classes have no year group.", 409);
    const duration = [30, 45, 60].includes(session.duration_minutes as number) ? (session.duration_minutes as number) : 60;

    // Same plan, week, sport and audience → same programme: a class with
    // two sessions in a week shares one generation.
    let programId: string | null = null;
    let title = "";
    let reused = false;
    {
      const { data: existing } = await supabase
        .from("programs")
        .select("id, content_json, age_groups")
        .eq("term_plan_id", plan.id)
        .eq("term_plan_week", week)
        .eq("sport", session.sport)
        .order("created_at", { ascending: false });
      const match = (existing ?? []).find(
        (p) => p.id !== session.program_id && [...((p.age_groups as string[]) ?? [])].sort().join(",") === ageGroups.join(",")
      );
      if (match) {
        programId = match.id as string;
        title = ((match.content_json as Record<string, unknown>)?.title as string) ?? "";
        reused = true;
      }
    }

    if (!programId) {
      const daily = checkDailyLimit(`program:${user.id}`, DAILY_LIMIT);
      if (!daily.allowed) {
        const hours = Math.ceil((daily.resetAt - Date.now()) / 3_600_000);
        return fail(`Daily generation limit reached (${DAILY_LIMIT}/day). Resets in ~${hours}h.`, 429);
      }

      // Centre kit on top of the standard bag.
      const { data: kits } = await supabase
        .from("equipment_kits")
        .select("id")
        .eq("location_type", "centre")
        .eq("location_id", plan.centre_id);
      const kitIds = (kits ?? []).map((k) => k.id as string);
      const { data: items } = kitIds.length
        ? await supabase.from("equipment_items").select("item_type").in("kit_id", kitIds).gt("quantity", 0)
        : { data: [] as Array<{ item_type: string }> };
      const availableEquipment = Array.from(
        new Set([...STANDARD_EQUIPMENT, ...(items ?? []).map((i) => i.item_type as string)])
      );

      const content = await generateProgram({
        subject: SUBJECTS.pdhpe,
        framework: frameworkOf(centre?.curriculum_framework),
        sport: session.sport as string,
        ageGroups,
        yearGroups,
        durationMinutes: duration,
        skillFocus: brief.focus,
        availableEquipment,
        planBrief: brief,
      });
      title = content.title ?? "";

      const { data: saved, error: saveErr } = await supabase
        .from("programs")
        .insert({
          subject: "pdhpe",
          sport: session.sport,
          age_groups: ageGroups,
          age_group: ageGroups[0],
          duration_minutes: duration,
          skill_focus: brief.focus.slice(0, 200),
          content_json: content as unknown as Record<string, unknown>,
          equipment_used: content.equipmentNeeded ?? availableEquipment,
          created_by: user.id,
          version_number: 1,
          parent_version_id: null,
          term_plan_id: plan.id,
          term_plan_week: week,
        })
        .select("id")
        .single();
      if (saveErr || !saved) return fail("The programme was written but could not be saved.", 500);
      programId = saved.id as string;
    }

    const { error: attachErr } = await supabase.from("sessions").update({ program_id: programId }).eq("id", session.id);
    if (attachErr) return fail("The programme was saved but could not be attached to the session.", 500);

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "program_generated_from_term_plan",
      entity_type: "program",
      entity_id: programId,
      metadata: { term_plan_id: plan.id, week, session_id: session.id, reused, replaced: Boolean(session.program_id) },
    });

    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");
    revalidatePath(`/client/${plan.centre_id}`, "layout");

    return NextResponse.json({ data: { programId, title, week, focus: brief.focus, reused } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    console.error("generate-plan-session error:", message);
    if (message.includes("cut off")) return fail(message, 422);
    if (message.includes("Failed to parse")) return fail("The AI returned an invalid response. Please try again.", 422);
    if (message.includes("rate_limit") || message.includes("429") || message.includes("overloaded") || message.includes("529")) {
      return fail("AI service is temporarily busy. Please try again in a minute.", 429);
    }
    return fail("Failed to write the programme. Please try again.", 500);
  }
}
