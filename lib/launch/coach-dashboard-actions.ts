"use server";

// ============================================================
// Coach Dashboard — Server actions for "today first" experience
// ============================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/launch/notifications";
import { sendEmail } from "@/lib/launch/email";
import { feedbackRequest } from "@/lib/launch/email-templates";
import { revalidatePath } from "next/cache";

// ========================
// Types
// ========================

export interface TodayChild {
  id: string;
  firstName: string;
  lastName: string;
  ageGroup: string;
  medicalNotes: string | null;
}

export interface TodaySession {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  centreName: string;
  address: string | null;
  sport: string;
  ageGroup: string | null;
  childCount: number;
  children: TodayChild[];
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  equipmentItems: string[];
  notes: string | null;
  status: string;
  attendanceMarked: boolean;
  sessionCompleted: boolean;
}

export interface WeekDay {
  date: string;
  dayLabel: string;
  sessions: Array<{
    sessionId: string;
    startTime: string;
    endTime: string;
    centreName: string;
    sport: string;
    childCount: number;
    status: string;
  }>;
}

// ========================
// Helpers
// ========================

function todayStr(): string {
  // Use Australian timezone
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function getWeekRange(todayDate: string): { start: string; end: string } {
  const d = new Date(todayDate + "T00:00:00");
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
}

// ========================
// 1. getTodaysSessions
// ========================

export async function getTodaysSessions(
  coachId: string
): Promise<{ data: TodaySession[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = todayStr();

    // Fetch sessions with centre details
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select(
        `id, date, time, duration_minutes, sport, status, coach_notes, equipment_kit_id,
         centres:centre_id(name, address, primary_contact_name, primary_contact_phone, primary_contact_email)`
      )
      .eq("coach_id", coachId)
      .eq("date", today)
      .neq("status", "cancelled")
      .order("time");

    if (sessErr) {
      console.error("getTodaysSessions error:", sessErr);
      return { data: [], error: "Failed to fetch today's sessions." };
    }

    if (!sessions || sessions.length === 0) {
      return { data: [], error: null };
    }

    const result: TodaySession[] = [];

    for (const raw of sessions) {
      const centre = (raw as any).centres as Record<string, any> | null;
      const centreId = (raw as any).centre_id as string | undefined;

      // Get children enrolled at this centre
      let children: TodayChild[] = [];
      if (centreId) {
        const { data: childLinks } = await supabase
          .from("centre_children")
          .select("child_id")
          .eq("centre_id", centreId)
          .eq("status", "active");

        if (childLinks && childLinks.length > 0) {
          const childIds = childLinks.map((c: { child_id: string }) => c.child_id);
          const { data: childRows } = await supabase
            .from("children")
            .select("id, first_name, last_name, age_group, medical_notes")
            .in("id", childIds)
            .eq("status", "active")
            .order("first_name");

          children = (childRows ?? []).map((c: { id: string; first_name: string; last_name: string; age_group: string; medical_notes: string | null }) => ({
            id: c.id,
            firstName: c.first_name,
            lastName: c.last_name,
            ageGroup: c.age_group,
            medicalNotes: c.medical_notes,
          }));
        }
      }

      // Get equipment items
      let equipmentItems: string[] = [];
      if (raw.equipment_kit_id) {
        const { data: items } = await supabase
          .from("equipment_items")
          .select("item_type, quantity")
          .eq("kit_id", raw.equipment_kit_id);

        equipmentItems = (items ?? []).map(
          (i: { item_type: string; quantity: number }) => `${i.item_type}${i.quantity > 1 ? ` x${i.quantity}` : ""}`
        );
      }

      // Check if attendance already marked
      const { count: attendanceCount } = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("session_id", raw.id);

      // Check if session notes exist
      const { data: existingNotes } = await supabase
        .from("session_notes")
        .select("id")
        .eq("session_id", raw.id)
        .eq("coach_id", coachId)
        .maybeSingle();

      result.push({
        sessionId: raw.id,
        date: raw.date,
        startTime: raw.time,
        endTime: calculateEndTime(raw.time, raw.duration_minutes),
        centreName: centre?.name ?? "Unknown",
        address: centre?.address ?? null,
        sport: raw.sport,
        ageGroup: null,
        childCount: children.length,
        children,
        contactName: centre?.primary_contact_name ?? null,
        contactPhone: centre?.primary_contact_phone ?? null,
        contactEmail: centre?.primary_contact_email ?? null,
        equipmentItems,
        notes: raw.coach_notes,
        status: raw.status,
        attendanceMarked: (attendanceCount ?? 0) > 0,
        sessionCompleted: raw.status === "completed" || !!existingNotes,
      });
    }

    return { data: result, error: null };
  } catch (err) {
    console.error("getTodaysSessions error:", err);
    return { data: [], error: "Failed to fetch today's sessions." };
  }
}

// ========================
// 2. getWeekSessions
// ========================

export async function getWeekSessions(
  coachId: string
): Promise<{ data: WeekDay[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = todayStr();
    const { start, end } = getWeekRange(today);

    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select(
        `id, date, time, duration_minutes, sport, status,
         centres:centre_id(name)`
      )
      .eq("coach_id", coachId)
      .gte("date", start)
      .lte("date", end)
      .neq("date", today)
      .neq("status", "cancelled")
      .order("date")
      .order("time");

    if (sessErr) {
      return { data: [], error: "Failed to fetch week sessions." };
    }

    // Group by day
    const dayMap = new Map<string, WeekDay>();

    for (const s of sessions ?? []) {
      const centre = (s as any).centres as Record<string, any> | null;
      const centreId = (s as any).centre_id as string | undefined;

      // Get child count for this session's centre
      let childCount = 0;
      if (centreId) {
        const { count } = await supabase
          .from("centre_children")
          .select("id", { count: "exact", head: true })
          .eq("centre_id", centreId)
          .eq("status", "active");
        childCount = count ?? 0;
      }

      if (!dayMap.has(s.date)) {
        dayMap.set(s.date, {
          date: s.date,
          dayLabel: formatDayLabel(s.date),
          sessions: [],
        });
      }

      dayMap.get(s.date)!.sessions.push({
        sessionId: s.id,
        startTime: s.time,
        endTime: calculateEndTime(s.time, s.duration_minutes),
        centreName: centre?.name ?? "Unknown",
        sport: s.sport,
        childCount,
        status: s.status,
      });
    }

    // Sort by date
    const result = Array.from(dayMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    return { data: result, error: null };
  } catch (err) {
    console.error("getWeekSessions error:", err);
    return { data: [], error: "Failed to fetch week sessions." };
  }
}

// ========================
// 3. markAttendance
// ========================

export async function markAttendance(params: {
  sessionId: string;
  coachId: string;
  attendanceRecords: Array<{ childId: string; status: "present" | "absent" }>;
  walkIns?: Array<{ childName: string; parentName: string; parentPhone: string }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Upsert enrolled children's attendance
    if (params.attendanceRecords.length > 0) {
      const rows = params.attendanceRecords.map((r) => ({
        session_id: params.sessionId,
        child_id: r.childId,
        status: r.status,
        marked_by: params.coachId,
        marked_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "session_id,child_id" });

      if (error) {
        console.error("markAttendance upsert error:", error);
        return { success: false, error: error.message };
      }
    }

    // Handle walk-ins: insert attendance with walk_in status and parent info
    if (params.walkIns && params.walkIns.length > 0) {
      const adminClient = createSupabaseAdmin();

      for (const walkIn of params.walkIns) {
        // Create a temporary child record
        const [firstName, ...lastParts] = walkIn.childName.trim().split(" ");
        const lastName = lastParts.join(" ") || "Unknown";

        const { data: newChild, error: childErr } = await adminClient
          .from("children")
          .insert({
            first_name: firstName,
            last_name: lastName,
            age_group: "5-8",
            parent_name: walkIn.parentName,
            parent_phone: walkIn.parentPhone,
            status: "active",
          })
          .select("id")
          .single();

        if (childErr || !newChild) {
          console.error("Walk-in child creation error:", childErr);
          continue;
        }

        await supabase.from("attendance").insert({
          session_id: params.sessionId,
          child_id: newChild.id,
          status: "walk_in",
          marked_by: params.coachId,
          marked_at: new Date().toISOString(),
          parent_name: walkIn.parentName,
          parent_phone: walkIn.parentPhone,
        });
      }
    }

    revalidatePath("/coach");
    return { success: true };
  } catch (err) {
    console.error("markAttendance error:", err);
    return { success: false, error: "Failed to save attendance." };
  }
}

// ========================
// 4. saveSessionNotes
// ========================

export async function saveSessionNotes(params: {
  sessionId: string;
  coachId: string;
  generalNotes?: string;
  rating?: number;
  childObservations?: Array<{ childId: string; observation: string }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();

    // 1. Upsert session notes
    const { error: notesErr } = await supabase
      .from("session_notes")
      .upsert(
        {
          session_id: params.sessionId,
          coach_id: params.coachId,
          general_notes: params.generalNotes || null,
          rating: params.rating || null,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "session_id,coach_id" }
      );

    if (notesErr) {
      console.error("saveSessionNotes upsert error:", notesErr);
      return { success: false, error: notesErr.message };
    }

    // 2. Insert child observations
    if (params.childObservations && params.childObservations.length > 0) {
      const obsRows = params.childObservations
        .filter((o) => o.observation.trim())
        .map((o) => ({
          session_id: params.sessionId,
          child_id: o.childId,
          coach_id: params.coachId,
          observation: o.observation.trim(),
        }));

      if (obsRows.length > 0) {
        const { error: obsErr } = await supabase
          .from("child_observations")
          .insert(obsRows);

        if (obsErr) {
          console.error("child_observations insert error:", obsErr);
        }
      }
    }

    // 3. Mark session as completed
    await supabase
      .from("sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", params.sessionId);

    // 4. Send notifications to parents of present children (fire-and-forget)
    void notifyParentsSessionComplete(params.sessionId).catch(console.error);

    // 5. Send feedback request email to centre director (fire-and-forget)
    void sendCentreFeedbackRequest(params.sessionId, params.coachId).catch(
      console.error
    );

    revalidatePath("/coach");
    return { success: true };
  } catch (err) {
    console.error("saveSessionNotes error:", err);
    return { success: false, error: "Failed to save session notes." };
  }
}

// ========================
// 5. uploadSessionPhoto
// ========================

export async function uploadSessionPhoto(
  formData: FormData
): Promise<{ success: boolean; storagePath?: string; error?: string }> {
  try {
    const sessionId = formData.get("sessionId") as string;
    const coachId = formData.get("coachId") as string;
    const file = formData.get("file") as File;

    if (!sessionId || !coachId || !file) {
      return { success: false, error: "Missing required fields." };
    }

    const supabase = await createSupabaseServerClient();

    // Check existing photo count (max 3)
    const { count } = await supabase
      .from("session_photos")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if ((count ?? 0) >= 3) {
      return { success: false, error: "Maximum 3 photos per session." };
    }

    // Upload to storage
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${sessionId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("session-photos")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error("Photo upload error:", uploadErr);
      return { success: false, error: "Failed to upload photo." };
    }

    // Insert record
    const { error: insertErr } = await supabase.from("session_photos").insert({
      session_id: sessionId,
      uploaded_by: coachId,
      storage_path: fileName,
    });

    if (insertErr) {
      console.error("session_photos insert error:", insertErr);
      return { success: false, error: "Photo uploaded but record creation failed." };
    }

    revalidatePath("/coach");
    return { success: true, storagePath: fileName };
  } catch (err) {
    console.error("uploadSessionPhoto error:", err);
    return { success: false, error: "Failed to upload photo." };
  }
}

// ========================
// 6. getExistingAttendance
// ========================

export async function getExistingAttendance(
  sessionId: string
): Promise<{
  data: Array<{ childId: string; status: string }>;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("attendance")
      .select("child_id, status")
      .eq("session_id", sessionId);

    if (error) return { data: [], error: error.message };

    return {
      data: (data ?? []).map((r: { child_id: string; status: string }) => ({
        childId: r.child_id,
        status: r.status,
      })),
      error: null,
    };
  } catch (err) {
    return { data: [], error: "Failed to fetch attendance." };
  }
}

// ========================
// Helpers: post-session notifications
// ========================

async function notifyParentsSessionComplete(sessionId: string) {
  const adminClient = createSupabaseAdmin();

  // Get session details
  const { data: session } = await adminClient
    .from("sessions")
    .select("sport, centre_id")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  // Get children marked as present
  const { data: presentKids } = await adminClient
    .from("attendance")
    .select("child_id")
    .eq("session_id", sessionId)
    .in("status", ["present", "walk_in"]);

  if (!presentKids || presentKids.length === 0) return;

  const childIds = presentKids.map((a: { child_id: string }) => a.child_id);

  // Find parent user IDs via parent_children junction
  const { data: parentLinks } = await adminClient
    .from("parent_children")
    .select("parent_id, child_id")
    .in("child_id", childIds);

  if (!parentLinks || parentLinks.length === 0) return;

  // Get parent_profiles for user_ids
  const parentIds = [...new Set(parentLinks.map((pl: { parent_id: string }) => pl.parent_id))];
  const { data: parents } = await adminClient
    .from("parent_profiles")
    .select("id, user_id")
    .in("id", parentIds);

  if (!parents) return;

  // Get child names for messages
  const { data: childRows } = await adminClient
    .from("children")
    .select("id, first_name")
    .in("id", childIds);

  const childNameMap = new Map(
    (childRows ?? []).map((c: { id: string; first_name: string }) => [c.id, c.first_name] as const)
  );
  const parentUserMap = new Map(
    parents.map((p: { id: string; user_id: string }) => [p.id, p.user_id] as const)
  );

  // Send a notification per parent-child pair
  for (const link of parentLinks as Array<{ parent_id: string; child_id: string }>) {
    const userId = parentUserMap.get(link.parent_id);
    if (!userId) continue;

    const childName = childNameMap.get(link.child_id) || "Your child";

    void createNotification({
      userId: userId as string,
      type: "session_completed",
      title: "Session Report Ready",
      message: `${childName}'s ${session.sport} session report is available.`,
      actionUrl: `/parent/children/${link.child_id}/insights`,
      metadata: { session_id: sessionId, child_id: link.child_id },
    }).catch(console.error);
  }
}

async function sendCentreFeedbackRequest(
  sessionId: string,
  coachId: string
) {
  const adminClient = createSupabaseAdmin();

  const { data: session } = await adminClient
    .from("sessions")
    .select("date, sport, centre_id")
    .eq("id", sessionId)
    .single();

  if (!session?.centre_id) return;

  const { data: centre } = await adminClient
    .from("centres")
    .select("name, primary_contact_name, primary_contact_email, send_feedback_emails")
    .eq("id", session.centre_id)
    .single();

  if (!centre?.primary_contact_email || !centre.send_feedback_emails) return;

  const { data: coach } = await adminClient
    .from("profiles")
    .select("name")
    .eq("id", coachId)
    .single();

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.buildalphakids.com.au";

  const email = feedbackRequest({
    directorName: centre.primary_contact_name || "Director",
    centreName: centre.name,
    sessionDate: session.date,
    coachName: coach?.name || "Your coach",
    feedbackUrl: `${APP_URL}/feedback?session=${sessionId}`,
  });

  void sendEmail({
    to: centre.primary_contact_email,
    subject: email.subject,
    html: email.html,
    emailType: "feedback_request",
    metadata: { session_id: sessionId },
  }).catch(console.error);
}
