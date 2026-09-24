"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification } from "@/lib/notifications/send";
import { CREW_EMBED, crewOf } from "@/lib/sessions/coach-membership";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// ============================================================
// Whole-term roster actions — publish, and chase confirmations
// ============================================================
//
// The status model is draft → published → pending_confirmation →
// confirmed, and a coach can confirm ONLY a pending_confirmation shift
// (lib/sessions/shift-actions.ts confirmShift). The week-level "Publish"
// left every shift at `published`, so coaches were told "you have new
// shifts to confirm" and could not — ops bulk-confirmed on their behalf
// instead. Publishing here sends a shift with a coach straight to
// pending_confirmation (and tells the coach); a shift with no coach is
// merely `published` (visible to the centre, nothing to confirm yet).
//
// Everything is scoped by the term's DATE window from today forward:
// the past is not re-published, and a mislabelled term_id changes
// nothing.

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not authenticated." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { supabase, user: null, error: "Not authorised." };
  }
  return { supabase, user, error: null };
}

async function termWindow(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, termId: string) {
  const { data: term } = await supabase.from("terms").select("id, name, start_date, end_date").eq("id", termId).maybeSingle();
  if (!term) return null;
  const today = sydneyTodayIso();
  return { ...term, from: term.start_date > today ? term.start_date : today };
}

export interface PublishTermResult {
  /** Shifts with a coach, now awaiting the coach's confirmation. */
  sent_to_coaches: number;
  /** Shifts with no coach, now visible to the centre. */
  published_unassigned: number;
  coaches_notified: number;
}

export async function publishTerm(termId: string): Promise<{ data: PublishTermResult | null; error: string | null }> {
  try {
    const { supabase, user, error: authErr } = await requireStaff();
    if (authErr || !user) return { data: null, error: authErr };
    const term = await termWindow(supabase, termId);
    if (!term) return { data: null, error: "Term not found." };

    const { data: drafts, error: selErr } = await supabase
      .from("sessions")
      .select(`id, date, coach_id, ${CREW_EMBED}`)
      .gte("date", term.from)
      .lte("date", term.end_date)
      .eq("status", "draft");
    if (selErr) throw selErr;
    const withCoach = (drafts ?? []).filter((s) => s.coach_id);
    const without = (drafts ?? []).filter((s) => !s.coach_id);

    if (withCoach.length > 0) {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "pending_confirmation" })
        .in("id", withCoach.map((s) => s.id))
        .eq("status", "draft");
      if (error) throw error;
    }
    if (without.length > 0) {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "published" })
        .in("id", without.map((s) => s.id))
        .eq("status", "draft");
      if (error) throw error;
    }

    // One notification per coach for the whole term — every coach on
    // each shift, lead or second.
    const perCoach = new Map<string, number>();
    for (const s of withCoach) for (const { userId } of crewOf(s)) perCoach.set(userId, (perCoach.get(userId) ?? 0) + 1);
    let coachesNotified = 0;
    if (perCoach.size > 0) {
      const { data: coaches } = await supabase.from("profiles").select("id, email, name, role").in("id", [...perCoach.keys()]);
      for (const c of coaches ?? []) {
        const n = perCoach.get(c.id) ?? 0;
        try {
          await triggerNotification(
            {
              type: "roster_published",
              title: `${term.name} roster is out`,
              body: `You have ${n} shift${n === 1 ? "" : "s"} to confirm in ${term.name}. Open your schedule to confirm each one.`,
              entityType: "term",
              entityId: term.id,
            },
            [{ userId: c.id, email: c.email, name: c.name, role: c.role }]
          );
          coachesNotified++;
        } catch (err) {
          console.error("publishTerm notify error:", err);
        }
      }
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "term_published",
      entity_type: "term",
      entity_id: term.id,
      metadata: { sent_to_coaches: withCoach.length, published_unassigned: without.length, from: term.from },
    });
    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");
    return {
      data: { sent_to_coaches: withCoach.length, published_unassigned: without.length, coaches_notified: coachesNotified },
      error: null,
    };
  } catch (err) {
    console.error("publishTerm error:", err);
    return { data: null, error: "Failed to publish the term." };
  }
}

export interface UnconfirmedByCoach {
  coach_id: string;
  name: string;
  count: number;
  /** Earliest unconfirmed shift date. */
  first_date: string;
}

/** Who still has shifts to confirm in the term, from today forward. */
export async function getUnconfirmedByCoach(termId: string): Promise<{ data: UnconfirmedByCoach[] | null; error: string | null }> {
  try {
    const { supabase, error: authErr } = await requireStaff();
    if (authErr) return { data: null, error: authErr };
    const term = await termWindow(supabase, termId);
    if (!term) return { data: null, error: "Term not found." };
    const { data: rows } = await supabase
      .from("sessions")
      .select(`id, date, coach_id, ${CREW_EMBED}`)
      .gte("date", term.from)
      .lte("date", term.end_date)
      .eq("status", "pending_confirmation")
      .order("date");
    const by = new Map<string, { count: number; first_date: string }>();
    for (const s of rows ?? []) {
      for (const { userId } of crewOf(s)) {
        const e = by.get(userId) ?? { count: 0, first_date: s.date as string };
        e.count++;
        by.set(userId, e);
      }
    }
    if (by.size === 0) return { data: [], error: null };
    const { data: coaches } = await supabase.from("profiles").select("id, name").in("id", [...by.keys()]);
    const name = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
    return {
      data: [...by.entries()]
        .map(([coach_id, e]) => ({ coach_id, name: name.get(coach_id) ?? "Coach", ...e }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      error: null,
    };
  } catch (err) {
    console.error("getUnconfirmedByCoach error:", err);
    return { data: null, error: "Failed to load unconfirmed shifts." };
  }
}

/** Nudge every coach with unconfirmed shifts in the term (one message each). */
export async function remindUnconfirmed(termId: string): Promise<{ data: { reminded: number } | null; error: string | null }> {
  try {
    const { supabase, user, error: authErr } = await requireStaff();
    if (authErr || !user) return { data: null, error: authErr };
    const { data: pending, error } = await getUnconfirmedByCoach(termId);
    if (error || !pending) return { data: null, error };
    if (pending.length === 0) return { data: { reminded: 0 }, error: null };
    const { data: term } = await supabase.from("terms").select("id, name").eq("id", termId).single();
    const { data: coaches } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .in("id", pending.map((p) => p.coach_id));
    let reminded = 0;
    for (const p of pending) {
      const c = (coaches ?? []).find((x) => x.id === p.coach_id);
      if (!c) continue;
      try {
        await triggerNotification(
          {
            type: "shift_reminder",
            title: `${p.count} shift${p.count === 1 ? "" : "s"} still to confirm`,
            body: `Please confirm your ${term?.name ?? "term"} shifts — the first is on ${p.first_date}. Open your schedule to confirm.`,
            entityType: "term",
            entityId: termId,
          },
          [{ userId: c.id, email: c.email, name: c.name, role: c.role }]
        );
        reminded++;
      } catch (err) {
        console.error("remindUnconfirmed notify error:", err);
      }
    }
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "term_confirmation_reminder_sent",
      entity_type: "term",
      entity_id: termId,
      metadata: { coaches: reminded },
    });
    return { data: { reminded }, error: null };
  } catch (err) {
    console.error("remindUnconfirmed error:", err);
    return { data: null, error: "Failed to send reminders." };
  }
}
