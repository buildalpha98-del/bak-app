"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionForFeedback {
  id: string;
  date: string;
  sport: string;
  coach_name: string;
  existingRating: number | null;
  existingComment: string | null;
  feedbackId: string | null;
}

export async function getSessionsForFeedback(centreId: string): Promise<SessionForFeedback[]> {
  const supabase = await createSupabaseServerClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, date, sport, coach_id,
      profiles!sessions_coach_id_fkey(name),
      feedback_ratings(id, rating, comment)
    `)
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  return (sessions ?? []).map((s) => {
    const feedback = Array.isArray((s as any).feedback_ratings)
      ? (s as any).feedback_ratings[0]
      : null;
    return {
      id: s.id,
      date: s.date,
      sport: s.sport,
      coach_name: (s as any).profiles?.name ?? "Unknown",
      existingRating: feedback?.rating ?? null,
      existingComment: feedback?.comment ?? null,
      feedbackId: feedback?.id ?? null,
    };
  });
}

export async function submitSessionFeedback(
  sessionId: string,
  centreId: string,
  rating: number,
  comment: string
) {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("feedback_ratings")
    .select("id")
    .eq("session_id", sessionId)
    .eq("centre_id", centreId)
    .single();

  if (existing) {
    await supabase
      .from("feedback_ratings")
      .update({ rating, comment, submitted_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    const { data: session } = await supabase
      .from("sessions")
      .select("coach_id, sport")
      .eq("id", sessionId)
      .single();

    await supabase.from("feedback_ratings").insert({
      session_id: sessionId,
      centre_id: centreId,
      coach_id: session?.coach_id ?? null,
      sport: session?.sport ?? null,
      rating,
      comment,
      feedback_token: crypto.randomUUID(),
      submitted_at: new Date().toISOString(),
    });
  }

  return { success: true };
}
