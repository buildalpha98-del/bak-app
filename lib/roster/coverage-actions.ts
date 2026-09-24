"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildCoverageBoard, type CoverageBoard } from "@/lib/roster/coverage-model";
import { plannableTerms } from "@/lib/schools/plannable-terms";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// The term coverage board (lib/roster/coverage-model.ts). Admin/ops;
// the server client's RLS enforces it.

export interface CoverageTermOption {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export async function getCoverageBoard(termId?: string | null): Promise<{
  data: { term: CoverageTermOption; terms: CoverageTermOption[]; board: CoverageBoard } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: allTerms } = await supabase
      .from("terms")
      .select("id, name, start_date, end_date, status")
      .order("start_date");
    const terms = (allTerms ?? []) as CoverageTermOption[];
    // Offer this term and coming ones; fall back to the latest term.
    const open = plannableTerms(terms, sydneyTodayIso());
    const options = open.length > 0 ? open : terms.slice(-1);
    const term = options.find((t) => t.id === termId) ?? options.find((t) => t.status === "active") ?? options[0];
    if (!term) return { data: null, error: "No terms yet." };

    // The last term that actually RAN something, by date: its centres
    // are the ones we expect to see again. (The term row immediately
    // before may be an empty draft, and a stray holiday session belongs
    // to no term at all.)
    let previous: CoverageTermOption | null = null;
    for (const t of terms.filter((x) => x.end_date < term.start_date).reverse()) {
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("date", t.start_date)
        .lte("date", t.end_date)
        .neq("status", "cancelled");
      if ((count ?? 0) > 0) {
        previous = t;
        break;
      }
    }

    const [{ data: centres }, { data: sessions }, { data: lastTerm }] = await Promise.all([
      supabase.from("centres").select("id, name, type, contract_status").order("name"),
      supabase
        .from("sessions")
        .select("centre_id, date, status, coach_id, program_id")
        .gte("date", term.start_date)
        .lte("date", term.end_date),
      previous
        ? supabase
            .from("sessions")
            .select("centre_id")
            .gte("date", previous.start_date)
            .lte("date", previous.end_date)
            .neq("status", "cancelled")
        : Promise.resolve({ data: [] as Array<{ centre_id: string }> }),
    ]);
    const hadLastTerm = new Set((lastTerm ?? []).map((s) => s.centre_id as string));
    // Churned centres are not expected to run; everything else is.
    const active = (centres ?? []).filter((c) => (c as { contract_status?: string }).contract_status !== "churned");

    const board = buildCoverageBoard(
      term,
      active.map((c) => ({ id: c.id as string, name: c.name as string, type: c.type as string, had_last_term: hadLastTerm.has(c.id as string) })),
      (sessions ?? []).map((s) => ({
        centre_id: s.centre_id as string,
        date: s.date as string,
        status: s.status as string,
        coach_id: (s.coach_id as string | null) ?? null,
        program_id: (s.program_id as string | null) ?? null,
      }))
    );
    return { data: { term, terms: options, board }, error: null };
  } catch (err) {
    console.error("getCoverageBoard error:", err);
    return { data: null, error: "Failed to load the term board." };
  }
}
