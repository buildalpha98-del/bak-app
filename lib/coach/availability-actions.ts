"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================
// A coach's own weekly availability
// ============================================================
//
// The AI solver's first hard constraint is "an availability slot covers
// this day and time" — a coach with no slots can never be assigned.
// Until now only staff could enter slots (from the coach's staff
// record), so most of the real team had none. This is the coach's own
// editor: one window per weekday, saved as availability_slots rows the
// coach owns (RLS coach_own_availability).
//
// Day numbers are ISO-ish as the solver reads them: 1 = Monday … 6 =
// Saturday, and Sunday is stored as 0 (the column allows 0–6).

export interface DayWindow {
  /** 0 = Sunday, 1 = Monday … 6 = Saturday. */
  day_of_week: number;
  /** "HH:MM" */
  start_time: string;
  end_time: string;
}

export async function getMyAvailability(): Promise<{ data: DayWindow[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };
    const { data, error } = await supabase
      .from("availability_slots")
      .select("day_of_week, start_time, end_time")
      .eq("user_id", user.id)
      .order("day_of_week")
      .order("start_time");
    if (error) throw error;
    return {
      data: (data ?? []).map((s) => ({
        day_of_week: s.day_of_week as number,
        start_time: String(s.start_time).slice(0, 5),
        end_time: String(s.end_time).slice(0, 5),
      })),
      error: null,
    };
  } catch (err) {
    console.error("getMyAvailability error:", err);
    return { data: null, error: "Failed to load your availability." };
  }
}

/** Replace the coach's week with these windows (one per day at most). */
export async function saveMyAvailability(windows: DayWindow[]): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const clean = windows.filter(
      (w) => Number.isInteger(w.day_of_week) && w.day_of_week >= 0 && w.day_of_week <= 6 && /^\d{2}:\d{2}$/.test(w.start_time) && /^\d{2}:\d{2}$/.test(w.end_time)
    );
    if (clean.some((w) => w.start_time >= w.end_time)) return { error: "Each day's finish time must be after its start time." };
    if (new Set(clean.map((w) => w.day_of_week)).size !== clean.length) return { error: "One window per day." };

    const { error: delErr } = await supabase.from("availability_slots").delete().eq("user_id", user.id);
    if (delErr) throw delErr;
    if (clean.length > 0) {
      const { error: insErr } = await supabase.from("availability_slots").insert(
        clean.map((w) => ({ user_id: user.id, day_of_week: w.day_of_week, start_time: w.start_time, end_time: w.end_time, location_preferences: [] }))
      );
      if (insErr) throw insErr;
    }
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "availability_updated",
      entity_type: "profile",
      entity_id: user.id,
      metadata: { days: clean.map((w) => w.day_of_week) },
    });
    revalidatePath("/coach/profile");
    return { error: null };
  } catch (err) {
    console.error("saveMyAvailability error:", err);
    return { error: "Failed to save your availability." };
  }
}
