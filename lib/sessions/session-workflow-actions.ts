"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSessionStatus } from "./actions";
import { revalidatePath } from "next/cache";
import { triggerNotificationForOps } from "@/lib/notifications/send";

// ============================================================
// Types
// ============================================================

export interface CompleteSessionData {
  headcount: number;
  activities_delivered: string;
  engagement_rating: number;
  observations: string;
  has_incident: boolean;
  incident?: IncidentData;
}

export interface IncidentData {
  child_name: string;
  description: string;
  action_taken: string;
  witnesses?: string;
  severity: "minor" | "moderate" | "serious";
  photo_urls?: string[];
  parent_notified: boolean;
  centre_staff_notified: boolean;
}

export interface ActiveSessionData {
  session: {
    id: string;
    date: string;
    time: string;
    duration_minutes: number;
    sport: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    headcount: number | null;
    coach_notes: string | null;
    actual_duration_minutes: number | null;
    needs_ops_review: boolean;
  };
  centre_name: string;
  program: {
    id: string;
    name: string;
    content_json: Record<string, unknown>;
    equipment_used: string[];
  } | null;
}

// ============================================================
// 1. startSession
// ============================================================

export async function startSession(
  sessionId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Fetch session
    const { data: session, error: fetchError } = await supabase
      .from("sessions")
      .select("id, coach_id, status, date, time, sport, centre_id")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) return { error: "Session not found." };

    // Verify ownership
    if (session.coach_id !== user.id) {
      return { error: "You are not assigned to this session." };
    }

    // Verify confirmed
    if (session.status !== "confirmed") {
      return { error: "Session must be confirmed before starting." };
    }

    // Verify within 30-minute window
    const sessionDT = new Date(`${session.date}T${session.time}`);
    const diffMs = sessionDT.getTime() - Date.now();
    if (diffMs > 30 * 60 * 1000) {
      return { error: "Too early to start. You can start within 30 minutes of the session time." };
    }

    // Transition to in_progress
    const result = await updateSessionStatus(sessionId, "in_progress");
    if (result.error) return result;

    // Activity log
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", session.centre_id)
      .single();

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_started",
      entity_type: "session",
      entity_id: sessionId,
      metadata: {
        date: session.date,
        sport: session.sport,
        centre_name: centre?.name ?? "Unknown",
      },
    });

    revalidatePath("/coach");
    revalidatePath(`/coach/schedule/${sessionId}`);
    return { error: null };
  } catch (err) {
    console.error("startSession error:", err);
    return { error: "Failed to start session." };
  }
}

// ============================================================
// 2. saveSessionProgress
// ============================================================

export async function saveSessionProgress(
  sessionId: string,
  data: { headcount?: number; coach_notes?: string }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify in_progress
    const { data: session } = await supabase
      .from("sessions")
      .select("status, coach_id")
      .eq("id", sessionId)
      .single();

    if (!session) return { error: "Session not found." };
    if (session.coach_id !== user.id)
      return { error: "Not your session." };
    if (session.status !== "in_progress")
      return { error: "Session is not in progress." };

    const updateData: Record<string, unknown> = {};
    if (data.headcount !== undefined) updateData.headcount = data.headcount;
    if (data.coach_notes !== undefined) updateData.coach_notes = data.coach_notes;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from("sessions")
        .update(updateData)
        .eq("id", sessionId);

      if (error) throw error;
    }

    return { error: null };
  } catch (err) {
    console.error("saveSessionProgress error:", err);
    return { error: "Failed to save progress." };
  }
}

// ============================================================
// 3. completeSession
// ============================================================

export async function completeSession(
  sessionId: string,
  data: CompleteSessionData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Fetch session
    const { data: session, error: fetchError } = await supabase
      .from("sessions")
      .select(
        "id, coach_id, status, started_at, duration_minutes, date, time, sport, centre_id"
      )
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) return { error: "Session not found." };
    if (session.coach_id !== user.id)
      return { error: "Not your session." };
    if (session.status !== "in_progress")
      return { error: "Session is not in progress." };
    if (!session.started_at)
      return { error: "Session has no start time." };

    // Calculate duration
    const now = new Date();
    const startedAt = new Date(session.started_at);
    const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 60_000;
    const rounded = Math.round(elapsedMinutes / 15) * 15;
    const needsReview = rounded > session.duration_minutes + 15;
    const actualDuration = needsReview
      ? rounded
      : Math.min(rounded, session.duration_minutes);

    // Update session — complete it
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "completed",
        completed_at: now.toISOString(),
        actual_duration_minutes: actualDuration,
        headcount: data.headcount,
        needs_ops_review: needsReview,
      })
      .eq("id", sessionId);

    if (updateError) throw updateError;

    // Get centre details for notifications and feedback
    const { data: centre } = await supabase
      .from("centres")
      .select("name, primary_contact_email, send_feedback_emails")
      .eq("id", session.centre_id)
      .single();
    const centreName = centre?.name ?? "Unknown";

    // Get default form template IDs
    const { data: templates } = await supabase
      .from("form_templates")
      .select("id, form_type")
      .eq("is_default", true)
      .in("form_type", ["attendance", "session_feedback", "incident"]);

    const templateMap = new Map(
      (templates ?? []).map((t) => [t.form_type, t.id])
    );

    // Insert attendance submission
    const attendanceTemplateId = templateMap.get("attendance");
    if (attendanceTemplateId) {
      await supabase.from("form_submissions").insert({
        form_template_id: attendanceTemplateId,
        session_id: sessionId,
        submitted_by: user.id,
        data_json: {
          headcount: data.headcount,
          date: session.date,
          centre: centreName,
          sport: session.sport,
        },
        attachments: [],
      });
    }

    // Insert feedback submission
    const feedbackTemplateId = templateMap.get("session_feedback");
    if (feedbackTemplateId) {
      await supabase.from("form_submissions").insert({
        form_template_id: feedbackTemplateId,
        session_id: sessionId,
        submitted_by: user.id,
        data_json: {
          activities_delivered: data.activities_delivered,
          engagement_rating: data.engagement_rating,
          observations: data.observations,
        },
        attachments: [],
      });
    }

    // Insert incident submission (if applicable)
    if (data.has_incident && data.incident) {
      const incidentTemplateId = templateMap.get("incident");
      if (incidentTemplateId) {
        await supabase.from("form_submissions").insert({
          form_template_id: incidentTemplateId,
          session_id: sessionId,
          submitted_by: user.id,
          data_json: {
            child_name: data.incident.child_name,
            description: data.incident.description,
            action_taken: data.incident.action_taken,
            witnesses: data.incident.witnesses ?? "",
            severity: data.incident.severity,
            parent_notified: data.incident.parent_notified,
            centre_staff_notified: data.incident.centre_staff_notified,
          },
          attachments: data.incident.photo_urls ?? [],
        });
      }
    }

    // Activity log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_completed",
      entity_type: "session",
      entity_id: sessionId,
      metadata: {
        date: session.date,
        sport: session.sport,
        centre_name: centreName,
        actual_duration_minutes: actualDuration,
        headcount: data.headcount,
        has_incident: data.has_incident,
        needs_ops_review: needsReview,
      },
    });

    // Notify ops if incident or review needed
    if (data.has_incident) {
      await triggerNotificationForOps({
        type: "incident_reported",
        title: "Incident Reported",
        body: `An incident was reported during ${session.sport} at ${centreName} on ${session.date}. Severity: ${data.incident?.severity ?? "unknown"}.`,
        entityType: "session",
        entityId: sessionId,
      });
    }

    if (needsReview) {
      await triggerNotificationForOps({
        type: "session_duration_review",
        title: "Session Duration Review Needed",
        body: `${session.sport} at ${centreName} on ${session.date} ran ${actualDuration}min (rostered ${session.duration_minutes}min). Please review.`,
        entityType: "session",
        entityId: sessionId,
      });
    }

    // Create feedback request + send email (fire-and-forget)
    try {
      if (centre?.send_feedback_emails && centre?.primary_contact_email) {
        const { createFeedbackRequest } = await import(
          "@/lib/feedback/actions"
        );
        const { feedbackRequestEmail } = await import(
          "@/lib/email/templates"
        );
        const { sendEmail } = await import("@/lib/email/send");

        const { token } = await createFeedbackRequest(
          sessionId,
          session.centre_id,
          session.coach_id ?? user.id,
          session.sport
        );

        if (token) {
          const feedbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.buildalphakids.com.au"}/feedback/${token}`;

          // Get coach name for email
          const { data: coachProfile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", session.coach_id ?? user.id)
            .single();

          const { subject, html } = feedbackRequestEmail(
            centreName,
            coachProfile?.name ?? "Your coach",
            session.sport,
            session.date,
            feedbackUrl
          );

          // Fire-and-forget — don't block session completion
          sendEmail(centre.primary_contact_email, subject, html).catch(
            (err) =>
              console.error("Feedback email send failed:", err)
          );
        }
      }
    } catch (feedbackErr) {
      // Never block session completion for feedback errors
      console.error("Feedback request creation failed:", feedbackErr);
    }

    revalidatePath("/coach");
    revalidatePath(`/coach/schedule/${sessionId}`);
    return { error: null };
  } catch (err) {
    console.error("completeSession error:", err);
    return { error: "Failed to complete session." };
  }
}

// ============================================================
// 4. getActiveSessionData
// ============================================================

export async function getActiveSessionData(
  sessionId: string,
  coachId: string
): Promise<{ data: ActiveSessionData | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: session, error: fetchError } = await supabase
      .from("sessions")
      .select(
        `id, date, time, duration_minutes, sport, status,
         started_at, completed_at, headcount, coach_notes,
         actual_duration_minutes, needs_ops_review,
         coach_id, centre_id, program_id`
      )
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) return { data: null, error: "Session not found." };

    // Verify ownership
    if (session.coach_id !== coachId) {
      return { data: null, error: "Not your session." };
    }

    // Centre name
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", session.centre_id)
      .single();

    // Program (if linked)
    let program: ActiveSessionData["program"] = null;
    if (session.program_id) {
      const { data: prog } = await supabase
        .from("programs")
        .select("id, name, content_json, equipment_used")
        .eq("id", session.program_id)
        .single();
      if (prog) {
        program = {
          id: prog.id,
          name: prog.name,
          content_json: prog.content_json as Record<string, unknown>,
          equipment_used: (prog.equipment_used as string[]) ?? [],
        };
      }
    }

    return {
      data: {
        session: {
          id: session.id,
          date: session.date,
          time: session.time,
          duration_minutes: session.duration_minutes,
          sport: session.sport,
          status: session.status,
          started_at: session.started_at,
          completed_at: session.completed_at,
          headcount: session.headcount,
          coach_notes: session.coach_notes,
          actual_duration_minutes: session.actual_duration_minutes,
          needs_ops_review: session.needs_ops_review,
        },
        centre_name: centre?.name ?? "Unknown",
        program,
      },
      error: null,
    };
  } catch (err) {
    console.error("getActiveSessionData error:", err);
    return { data: null, error: "Failed to fetch session data." };
  }
}

// ============================================================
// 5. uploadIncidentPhoto
// ============================================================

export async function uploadIncidentPhoto(
  formData: FormData
): Promise<{ data: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const file = formData.get("file") as File | null;
    if (!file) return { data: null, error: "No file provided." };

    // Validate image type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowedTypes.includes(file.type)) {
      return { data: null, error: "Invalid file type. Only images are allowed." };
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return { data: null, error: "File too large. Maximum 5MB." };
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("incident-photos")
      .upload(path, file);

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("incident-photos").getPublicUrl(path);

    return { data: publicUrl, error: null };
  } catch (err) {
    console.error("uploadIncidentPhoto error:", err);
    return { data: null, error: "Failed to upload photo." };
  }
}
