"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CREW_EMBED, crewOf } from "@/lib/sessions/coach-membership";
import { buildDeliveryLog, type DeliveryLog, type DeliveryLogSession } from "@/lib/centres/delivery-log";

// The delivery log for one centre and term (lib/centres/delivery-log.ts).
// Staff only — the server client's RLS enforces it.

export interface DeliveryLogTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export async function getCentreDeliveryLog(
  centreId: string,
  termId?: string | null
): Promise<{ data: { term: DeliveryLogTerm; terms: DeliveryLogTerm[]; log: DeliveryLog; centre_name: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const [{ data: centre }, { data: termRows }] = await Promise.all([
      supabase.from("centres").select("name").eq("id", centreId).maybeSingle(),
      supabase.from("terms").select("id, name, start_date, end_date, status").order("start_date", { ascending: false }),
    ]);
    if (!centre) return { data: null, error: "Centre not found." };
    const terms = (termRows ?? []) as DeliveryLogTerm[];
    const term = terms.find((t) => t.id === termId) ?? terms.find((t) => t.status === "active") ?? terms[0];
    if (!term) return { data: null, error: "No terms yet." };

    const { data: rows, error } = await supabase
      .from("sessions")
      .select(
        `id, date, time, status, sport, duration_minutes, actual_duration_minutes, headcount, school_class_ids, programs:program_id(content_json), ${CREW_EMBED}`
      )
      .eq("centre_id", centreId)
      .gte("date", term.start_date)
      .lte("date", term.end_date)
      .order("date");
    if (error) throw error;

    const coachIds = Array.from(new Set((rows ?? []).flatMap((r) => crewOf(r).map((c) => c.userId))));
    const classIds = Array.from(new Set((rows ?? []).flatMap((r) => ((r as Record<string, unknown>).school_class_ids as string[] | null) ?? [])));
    const [{ data: coaches }, { data: classes }] = await Promise.all([
      coachIds.length ? supabase.from("profiles").select("id, name").in("id", coachIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      classIds.length ? supabase.from("school_classes").select("id, name").in("id", classIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
    const className = new Map((classes ?? []).map((c) => [c.id as string, c.name as string]));

    const sessions: DeliveryLogSession[] = (rows ?? []).map((r) => {
      const content = (r.programs as unknown as { content_json: { title?: string; curriculumOutcomes?: Array<{ code: string }> } | null } | null)?.content_json ?? null;
      return {
        id: r.id as string,
        date: r.date as string,
        time: r.time as string,
        status: r.status as string,
        sport: r.sport as string,
        duration_minutes: r.duration_minutes as number,
        actual_duration_minutes: (r.actual_duration_minutes as number | null) ?? null,
        headcount: (r.headcount as number | null) ?? null,
        coach_names: crewOf(r).map((c) => coachName.get(c.userId) ?? "Coach"),
        programme_title: content?.title ?? null,
        outcome_codes: (content?.curriculumOutcomes ?? []).map((o) => o.code).filter(Boolean),
        class_names: (((r as Record<string, unknown>).school_class_ids as string[] | null) ?? []).map((id) => className.get(id) ?? "Class"),
      };
    });
    return { data: { term, terms, log: buildDeliveryLog(sessions), centre_name: centre.name as string }, error: null };
  } catch (err) {
    console.error("getCentreDeliveryLog error:", err);
    return { data: null, error: "Failed to load the delivery log." };
  }
}
