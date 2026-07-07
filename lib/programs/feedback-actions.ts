"use server";

// ============================================================
// Programme feedback — coach signal loop (migration 060)
// ============================================================
//
// Coaches rate how a programme landed after delivering it. Ops reads
// the aggregate on the programme detail page. One row per
// (session, coach); resubmits update in place.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ProgramFeedbackRating = "too_easy" | "just_right" | "too_hard";

export interface ProgramFeedbackSummary {
  total: number;
  tooEasy: number;
  justRight: number;
  tooHard: number;
  recentComments: Array<{
    rating: ProgramFeedbackRating;
    comment: string;
    coach_name: string | null;
    created_at: string;
  }>;
}

const VALID_RATINGS: ProgramFeedbackRating[] = [
  "too_easy",
  "just_right",
  "too_hard",
];

export async function submitProgramFeedback(input: {
  sessionId: string;
  programId: string;
  rating: ProgramFeedbackRating;
  comment?: string;
}): Promise<{ error: string | null }> {
  try {
    if (!VALID_RATINGS.includes(input.rating)) {
      return { error: "Invalid rating." };
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const comment = (input.comment ?? "").trim().slice(0, 500) || null;

    const { error } = await supabase.from("session_program_feedback").upsert(
      {
        session_id: input.sessionId,
        program_id: input.programId,
        coach_id: user.id,
        rating: input.rating,
        comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,coach_id" }
    );

    if (error) return { error: error.message };

    revalidatePath("/admin/programs");
    revalidatePath("/ops/programs");
    return { error: null };
  } catch (err) {
    console.error("submitProgramFeedback error:", err);
    return { error: "Failed to save feedback." };
  }
}

/** The calling coach's existing feedback for a session, if any. */
export async function getMyProgramFeedback(sessionId: string): Promise<{
  data: { rating: ProgramFeedbackRating; comment: string | null } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("session_program_feedback")
      .select("rating, comment")
      .eq("session_id", sessionId)
      .eq("coach_id", user.id)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return {
      data: data
        ? {
            rating: data.rating as ProgramFeedbackRating,
            comment: data.comment,
          }
        : null,
      error: null,
    };
  } catch (err) {
    console.error("getMyProgramFeedback error:", err);
    return { data: null, error: "Failed to load feedback." };
  }
}

/** Aggregate feedback for a programme (staff-facing detail page). */
export async function getProgramFeedbackSummary(programId: string): Promise<{
  data: ProgramFeedbackSummary | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("session_program_feedback")
      .select("rating, comment, created_at, profiles(name)")
      .eq("program_id", programId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return { data: null, error: error.message };

    const rows = data ?? [];
    const summary: ProgramFeedbackSummary = {
      total: rows.length,
      tooEasy: rows.filter((r) => r.rating === "too_easy").length,
      justRight: rows.filter((r) => r.rating === "just_right").length,
      tooHard: rows.filter((r) => r.rating === "too_hard").length,
      recentComments: rows
        .filter((r) => r.comment)
        .slice(0, 5)
        .map((r) => ({
          rating: r.rating as ProgramFeedbackRating,
          comment: r.comment as string,
          coach_name:
            (r.profiles as unknown as { name: string | null } | null)?.name ??
            null,
          created_at: r.created_at,
        })),
    };

    return { data: summary, error: null };
  } catch (err) {
    console.error("getProgramFeedbackSummary error:", err);
    return { data: null, error: "Failed to load feedback summary." };
  }
}
