"use server";

// Report-card release control (migration 090). The primary contact sets
// a date teachers finish by and releases the term's report cards; until
// then only they (and staff) can open one. Reads go through the cookie
// client (RLS: own centres); writes through the admin client after the
// primary check, as the colleague invites do.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCallerClientUser } from "@/lib/client/actions";

export interface ReportCardRelease {
  term_id: string;
  term_name: string;
  due_date: string | null;
  released_at: string | null;
  released_by_name: string | null;
}

/** The active term's release row for a centre (null fields when none yet). */
export async function getReportCardRelease(
  centreId: string
): Promise<{ data: ReportCardRelease | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: term } = await supabase
      .from("terms")
      .select("id, name")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!term) return { data: null, error: null };

    const { data: row } = await supabase
      .from("report_card_releases")
      .select("due_date, released_at, released_by")
      .eq("centre_id", centreId)
      .eq("term_id", term.id)
      .maybeSingle();

    let releasedByName: string | null = null;
    if (row?.released_by) {
      const admin = createSupabaseAdmin();
      const { data: who } = await admin
        .from("client_users")
        .select("name")
        .eq("id", row.released_by)
        .maybeSingle();
      releasedByName = who?.name ?? null;
    }

    return {
      data: {
        term_id: term.id,
        term_name: term.name,
        due_date: row?.due_date ?? null,
        released_at: row?.released_at ?? null,
        released_by_name: releasedByName,
      },
      error: null,
    };
  } catch (err) {
    console.error("getReportCardRelease error:", err);
    return { data: null, error: "Failed to load report-card status." };
  }
}

/** Has this centre released report cards for the given term? (route gate) */
export async function isTermReleased(centreId: string, termId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("report_card_releases")
    .select("released_at")
    .eq("centre_id", centreId)
    .eq("term_id", termId)
    .maybeSingle();
  return !!data?.released_at;
}

async function requirePrimary(centreId: string) {
  const { cu, isAuthorised } = await getCallerClientUser(centreId);
  if (!cu || !isAuthorised || !cu.is_primary) return null;
  return cu;
}

export async function setReportCardDueDate(
  centreId: string,
  termId: string,
  dueDate: string | null
): Promise<{ error: string | null }> {
  try {
    const cu = await requirePrimary(centreId);
    if (!cu) return { error: "Only the primary contact can set the due date." };
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Pick a date." };
    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("report_card_releases")
      .upsert(
        { centre_id: centreId, term_id: termId, due_date: dueDate },
        { onConflict: "centre_id,term_id" }
      );
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("setReportCardDueDate error:", err);
    return { error: "Failed to save the due date." };
  }
}

export async function releaseReportCards(
  centreId: string,
  termId: string
): Promise<{ error: string | null }> {
  try {
    const cu = await requirePrimary(centreId);
    if (!cu) return { error: "Only the primary contact can release report cards." };
    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("report_card_releases")
      .upsert(
        {
          centre_id: centreId,
          term_id: termId,
          released_at: new Date().toISOString(),
          released_by: cu.id,
        },
        { onConflict: "centre_id,term_id" }
      );
    if (error) throw error;
    await admin.from("activity_log").insert({
      user_id: cu.user_id,
      action: "report_cards_released",
      entity_type: "centre",
      entity_id: centreId,
      metadata: { term_id: termId, client_user_id: cu.id },
    });
    return { error: null };
  } catch (err) {
    console.error("releaseReportCards error:", err);
    return { error: "Failed to release report cards." };
  }
}

/** Pull a release back (e.g. a mark needs fixing) — primary only. */
export async function withdrawReportCards(
  centreId: string,
  termId: string
): Promise<{ error: string | null }> {
  try {
    const cu = await requirePrimary(centreId);
    if (!cu) return { error: "Only the primary contact can withdraw report cards." };
    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("report_card_releases")
      .update({ released_at: null, released_by: null })
      .eq("centre_id", centreId)
      .eq("term_id", termId);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("withdrawReportCards error:", err);
    return { error: "Failed to withdraw report cards." };
  }
}
