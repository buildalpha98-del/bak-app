import "server-only";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isCoachOnSession } from "@/lib/sessions/coach-membership";
import { z } from "zod";
export async function createFeedbackRequest(
  sessionId: string,
  centreId: string,
  coachId: string,
  sport: string
): Promise<{ token: string | null; error: string | null }> {
  const { supabase, user, profile } = await requireRole(["admin", "ops", "coach"]);
  z.uuid().parse(sessionId);
  if (profile.role === "coach" && !await isCoachOnSession(supabase, sessionId, user.id)) return { token: null, error: "Not authorised." };
  const { data: session, error: sessionError } = await supabase.from("sessions").select("centre_id, coach_id, sport").eq("id", sessionId).single();
  if (sessionError || !session) return { token: null, error: sessionError?.message ?? "Session not found." };
  centreId = session.centre_id;
  coachId = session.coach_id;
  sport = session.sport;

  const admin = createSupabaseAdmin();

  // Dedup: skip if a feedback request already exists for this session
  const { data: existing, error: existingError } = await admin
    .from("feedback_ratings")
    .select("feedback_token")
    .eq("session_id", sessionId)
    .limit(1)
    .maybeSingle();

  if (existingError) return { token: null, error: existingError.message };
  if (existing) {
    return { token: existing.feedback_token, error: null };
  }

  const { data, error } = await admin
    .from("feedback_ratings")
    .insert({
      session_id: sessionId,
      centre_id: centreId,
      coach_id: coachId,
      sport,
      // rating is NULL (pending)
    })
    .select("feedback_token")
    .single();

  if (error) return { token: null, error: error.message };
  return { token: data.feedback_token, error: null };
}
