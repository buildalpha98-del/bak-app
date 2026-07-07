"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { TermStatus } from "@/lib/types/enums";
import type { Term, TermTemplate, Session, Centre, Profile } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface TermListItem extends Term {
  template_count: number;
  session_count: number;
}

export interface TermTemplateWithRelations extends TermTemplate {
  centre_name: string;
  coach_name: string | null;
}

export interface CreateTermData {
  name: string;
  start_date: string;
  end_date: string;
  year: number;
}

export interface UpdateTermData {
  name?: string;
  start_date?: string;
  end_date?: string;
  year?: number;
  status?: TermStatus;
}

export interface CreateTemplateEntryData {
  term_id: string;
  day_of_week: number; // 1=Mon ... 5=Fri
  time: string; // "HH:mm"
  duration_minutes: number;
  centre_id: string;
  sport: string;
  default_coach_id?: string;
}

export interface UpdateTemplateEntryData {
  day_of_week?: number;
  time?: string;
  duration_minutes?: number;
  centre_id?: string;
  sport?: string;
  default_coach_id?: string | null;
}

export interface DuplicateTermData {
  source_term_id: string;
  name: string;
  start_date: string;
  end_date: string;
  year: number;
  clear_coaches: boolean;
}

// ============================================================
// 1. getTermList
// ============================================================

export async function getTermList(): Promise<{
  data: TermListItem[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: terms, error: termsError } = await supabase
      .from("terms")
      .select("*")
      .order("year", { ascending: false })
      .order("start_date", { ascending: false });

    if (termsError) throw termsError;
    if (!terms) return { data: [], error: null };

    // Get template counts
    const { data: templates, error: tplError } = await supabase
      .from("term_templates")
      .select("term_id");

    if (tplError) throw tplError;

    // Get session counts
    const { data: sessions, error: sessError } = await supabase
      .from("sessions")
      .select("term_id");

    if (sessError) throw sessError;

    const tplCountMap = new Map<string, number>();
    for (const t of templates ?? []) {
      tplCountMap.set(t.term_id, (tplCountMap.get(t.term_id) ?? 0) + 1);
    }

    const sessCountMap = new Map<string, number>();
    for (const s of sessions ?? []) {
      sessCountMap.set(s.term_id, (sessCountMap.get(s.term_id) ?? 0) + 1);
    }

    const items: TermListItem[] = terms.map((t) => ({
      ...t,
      template_count: tplCountMap.get(t.id) ?? 0,
      session_count: sessCountMap.get(t.id) ?? 0,
    }));

    return { data: items, error: null };
  } catch (err) {
    console.error("getTermList error:", err);
    return { data: null, error: "Failed to load terms." };
  }
}

// ============================================================
// 2. getTermDetail
// ============================================================

export async function getTermDetail(
  id: string
): Promise<{ data: Term | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: term, error } = await supabase
      .from("terms")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return { data: term, error: null };
  } catch (err) {
    console.error("getTermDetail error:", err);
    return { data: null, error: "Failed to load term." };
  }
}

// ============================================================
// 3. getTermTemplates
// ============================================================

export async function getTermTemplates(
  termId: string
): Promise<{ data: TermTemplateWithRelations[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: raw, error } = await supabase
      .from("term_templates")
      .select("*, centres:centre_id(name), profiles:default_coach_id(name)")
      .eq("term_id", termId)
      .order("day_of_week")
      .order("time");

    if (error) throw error;

    const templates: TermTemplateWithRelations[] = (raw ?? []).map((t) => ({
      id: t.id,
      term_id: t.term_id,
      day_of_week: t.day_of_week,
      time: t.time,
      duration_minutes: t.duration_minutes,
      centre_id: t.centre_id,
      sport: t.sport,
      default_coach_id: t.default_coach_id,
      created_at: t.created_at,
      centre_name:
        (t.centres as unknown as { name: string } | null)?.name ?? "Unknown",
      coach_name:
        (t.profiles as unknown as { name: string } | null)?.name ?? null,
    }));

    return { data: templates, error: null };
  } catch (err) {
    console.error("getTermTemplates error:", err);
    return { data: null, error: "Failed to load templates." };
  }
}

// ============================================================
// 4. getActiveCoaches
// ============================================================

export async function getActiveCoaches(): Promise<{
  data: Pick<Profile, "id" | "name">[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .order("name");

    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getActiveCoaches error:", err);
    return { data: null, error: "Failed to load coaches." };
  }
}

// ============================================================
// 5. createTerm
// ============================================================

export async function createTerm(
  data: CreateTermData
): Promise<{ data: Term | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: term, error } = await supabase
      .from("terms")
      .insert({
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date,
        year: data.year,
        status: "draft" as TermStatus,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: term, error: null };
  } catch (err) {
    console.error("createTerm error:", err);
    return { data: null, error: "Failed to create term." };
  }
}

// ============================================================
// 6. updateTerm — activating sets previous active to completed
// ============================================================

export async function updateTerm(
  id: string,
  data: UpdateTermData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // If activating, complete the currently active term first
    if (data.status === "active") {
      const { data: activeTerm } = await supabase
        .from("terms")
        .select("id")
        .eq("status", "active")
        .neq("id", id)
        .maybeSingle();

      if (activeTerm) {
        await supabase
          .from("terms")
          .update({ status: "completed" as TermStatus })
          .eq("id", activeTerm.id);
      }
    }

    const { error } = await supabase
      .from("terms")
      .update(data)
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("updateTerm error:", err);
    return { error: "Failed to update term." };
  }
}

// ============================================================
// 7. deleteTerm — only draft with no sessions
// ============================================================

export async function deleteTerm(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Check term is draft
    const { data: term } = await supabase
      .from("terms")
      .select("status")
      .eq("id", id)
      .single();

    if (term?.status !== "draft") {
      return { error: "Only draft terms can be deleted." };
    }

    // Check no sessions exist
    const { count } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("term_id", id);

    if (count && count > 0) {
      return { error: "Cannot delete a term that has generated sessions." };
    }

    // Delete templates first, then the term
    await supabase.from("term_templates").delete().eq("term_id", id);
    const { error } = await supabase.from("terms").delete().eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("deleteTerm error:", err);
    return { error: "Failed to delete term." };
  }
}

// ============================================================
// 8. createTemplateEntry
// ============================================================

export async function createTemplateEntry(
  data: CreateTemplateEntryData
): Promise<{ data: TermTemplate | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: entry, error } = await supabase
      .from("term_templates")
      .insert({
        term_id: data.term_id,
        day_of_week: data.day_of_week,
        time: data.time,
        duration_minutes: data.duration_minutes,
        centre_id: data.centre_id,
        sport: data.sport,
        default_coach_id: data.default_coach_id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: entry, error: null };
  } catch (err) {
    console.error("createTemplateEntry error:", err);
    return { data: null, error: "Failed to create template entry." };
  }
}

// ============================================================
// 9. updateTemplateEntry
// ============================================================

export async function updateTemplateEntry(
  id: string,
  data: UpdateTemplateEntryData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("term_templates")
      .update(data)
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("updateTemplateEntry error:", err);
    return { error: "Failed to update template entry." };
  }
}

// ============================================================
// 10. deleteTemplateEntry
// ============================================================

export async function deleteTemplateEntry(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("term_templates")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("deleteTemplateEntry error:", err);
    return { error: "Failed to delete template entry." };
  }
}

// ============================================================
// 11. generateSessionsForWeek
// ============================================================

export async function generateSessionsForWeek(
  termId: string,
  weekStartDate: string // Monday of target week, "YYYY-MM-DD"
): Promise<{
  data: { created: number; skipped: number } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Validate the term exists
    const { data: term } = await supabase
      .from("terms")
      .select("*")
      .eq("id", termId)
      .single();

    if (!term) return { data: null, error: "Term not found." };

    // Fetch all templates for this term
    const { data: templates } = await supabase
      .from("term_templates")
      .select("*")
      .eq("term_id", termId);

    if (!templates || templates.length === 0) {
      return { data: null, error: "No templates found for this term." };
    }

    // Calculate the week end (Friday). All date maths here is forced
    // to UTC ("T00:00:00Z" + setUTCDate) — parsing "T00:00:00" without
    // the Z uses the server's local timezone, and toISOString() then
    // shifts the date back a day on any server east of Greenwich
    // (Vercel bom1 is UTC+5:30), turning Monday templates into Sunday
    // sessions.
    const monday = new Date(weekStartDate + "T00:00:00Z");
    const friday = new Date(monday);
    friday.setUTCDate(friday.getUTCDate() + 4);
    const weekEndDate = friday.toISOString().split("T")[0];

    // Fetch existing sessions for this term in this week
    const { data: existingSessions } = await supabase
      .from("sessions")
      .select("template_id, date")
      .eq("term_id", termId)
      .gte("date", weekStartDate)
      .lte("date", weekEndDate);

    const existingSet = new Set(
      (existingSessions ?? []).map((s) => `${s.template_id}_${s.date}`)
    );

    // Build new sessions
    const newSessions: Array<{
      term_id: string;
      template_id: string;
      date: string;
      time: string;
      duration_minutes: number;
      centre_id: string;
      coach_id: string | null;
      sport: string;
      status: string;
    }> = [];

    let skipped = 0;

    for (const tpl of templates) {
      // Calculate target date from day_of_week (1=Mon, 2=Tue, ...) —
      // UTC arithmetic to match the UTC-parsed monday above.
      const targetDate = new Date(monday);
      targetDate.setUTCDate(targetDate.getUTCDate() + (tpl.day_of_week - 1));
      const dateStr = targetDate.toISOString().split("T")[0];

      const key = `${tpl.id}_${dateStr}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }

      newSessions.push({
        term_id: termId,
        template_id: tpl.id,
        date: dateStr,
        time: tpl.time,
        duration_minutes: tpl.duration_minutes,
        centre_id: tpl.centre_id,
        coach_id: tpl.default_coach_id,
        sport: tpl.sport,
        status: "draft",
      });
    }

    if (newSessions.length > 0) {
      const { error: insertError } = await supabase
        .from("sessions")
        .insert(newSessions);

      if (insertError) throw insertError;
    }

    return {
      data: { created: newSessions.length, skipped },
      error: null,
    };
  } catch (err) {
    console.error("generateSessionsForWeek error:", err);
    return { data: null, error: "Failed to generate sessions." };
  }
}

// ============================================================
// 12. duplicateTerm
// ============================================================

export async function duplicateTerm(
  data: DuplicateTermData
): Promise<{ data: Term | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch source templates
    const { data: sourceTemplates, error: tplError } = await supabase
      .from("term_templates")
      .select("*")
      .eq("term_id", data.source_term_id);

    if (tplError) throw tplError;

    // Create new term
    const { data: newTerm, error: termError } = await supabase
      .from("terms")
      .insert({
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date,
        year: data.year,
        status: "draft" as TermStatus,
      })
      .select()
      .single();

    if (termError) throw termError;

    // Copy templates
    if (sourceTemplates && sourceTemplates.length > 0 && newTerm) {
      const copies = sourceTemplates.map((t) => ({
        term_id: newTerm.id,
        day_of_week: t.day_of_week,
        time: t.time,
        duration_minutes: t.duration_minutes,
        centre_id: t.centre_id,
        sport: t.sport,
        default_coach_id: data.clear_coaches ? null : t.default_coach_id,
      }));

      const { error: copyError } = await supabase
        .from("term_templates")
        .insert(copies);

      if (copyError) throw copyError;
    }

    return { data: newTerm, error: null };
  } catch (err) {
    console.error("duplicateTerm error:", err);
    return { data: null, error: "Failed to duplicate term." };
  }
}

// ============================================================
// 13. getActiveTerm
// ============================================================

export async function getActiveTerm(): Promise<{
  data: Term | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: term, error } = await supabase
      .from("terms")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    if (error) throw error;
    return { data: term, error: null };
  } catch (err) {
    console.error("getActiveTerm error:", err);
    return { data: null, error: "Failed to load active term." };
  }
}

// ============================================================
// Helper: getCentresForSelect
// ============================================================

export async function getCentresForSelect(): Promise<{
  data: Pick<Centre, "id" | "name">[] | null;
  error: string | null;
}> {
  try {
    // Use admin client — reference data all authenticated users should see
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("centres")
      .select("id, name")
      .order("name");

    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch {
    return { data: null, error: "Failed to load centres." };
  }
}
