"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification } from "@/lib/notifications/send";
import type {
  SessionStatus,
  CentreType,
  CentreNoteCategory,
  EquipmentCondition,
  ItemCondition,
} from "@/lib/types/enums";
import type { Session, Program, FeedbackRating } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

/** Session with centre details — used by all coach views */
export interface CoachSessionWithCentre extends Session {
  centre_name: string;
  centre_type: CentreType;
  centre_address: string | null;
  term_name: string;
  /** Only populated when fetching next session */
  centre_contact_name?: string | null;
  centre_contact_phone?: string | null;
  /** Equipment kit name if assigned */
  equipment_kit_name?: string | null;
}

/** Lightweight session for term calendar dots */
export interface TermSessionSummary {
  id: string;
  date: string;
  status: SessionStatus;
  sport: string;
}

/** Pending action counts for home page */
export interface PendingActionCounts {
  pendingShifts: number;
  swapRequests: number;
  onboardingItems: number;
}

/** Announcement with read status */
export interface AnnouncementWithRead {
  id: string;
  title: string;
  body: string;
  created_at: string;
  isRead: boolean;
}

/** Centre note for session detail */
export interface SessionCentreNote {
  id: string;
  category: CentreNoteCategory;
  content: string;
  created_at: string;
}

/** Equipment item for session detail */
export interface SessionEquipmentItem {
  id: string;
  item_type: string;
  quantity: number;
  condition: ItemCondition;
}

/** Equipment kit for session detail */
export interface SessionEquipmentKit {
  id: string;
  name: string;
  condition: EquipmentCondition;
}

/** Shift thread message with author */
export interface ShiftThreadMessage {
  id: string;
  content: string | null;
  author_name: string;
  user_id: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  parent_message_id: string | null;
  reply_count: number;
}

/** Full session detail for coach detail page */
export interface CoachSessionDetail {
  session: CoachSessionWithCentre & {
    centre_contact_name: string | null;
    centre_contact_phone: string | null;
    centre_contact_email: string | null;
    /**
     * Flat list of every coach assigned to this session, ordered with
     * the primary first. Populated via a join on `session_coaches`.
     * Empty when no coach is assigned.
     */
    assigned_coaches: Array<{
      user_id: string;
      name: string | null;
      is_primary: boolean;
    }>;
  };
  centreNotes: SessionCentreNote[];
  program: Program | null;
  equipmentKit: SessionEquipmentKit | null;
  equipmentItems: SessionEquipmentItem[];
  shiftThread: ShiftThreadMessage[];
  feedback: FeedbackRating | null;
}

// ============================================================
// Helpers
// ============================================================

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function mapSession(raw: Record<string, unknown>): CoachSessionWithCentre {
  const centre = raw.centres as unknown as Record<string, unknown> | null;
  const term = raw.terms as unknown as Record<string, unknown> | null;
  const kit = raw.equipment_kits as unknown as Record<string, unknown> | null;

  return {
    ...(raw as unknown as Session),
    centre_name: (centre?.name as string) ?? "Unknown",
    centre_type: (centre?.type as CentreType) ?? "childcare_centre",
    centre_address: (centre?.address as string) ?? null,
    term_name: (term?.name as string) ?? "",
    equipment_kit_name: (kit?.name as string) ?? null,
  };
}

// ============================================================
// 1. getCoachNextSession
// ============================================================

export async function getCoachNextSession(
  coachId: string
): Promise<{ data: CoachSessionWithCentre | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = todayString();

    const { data: raw, error } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type, address, primary_contact_name, primary_contact_phone), terms:term_id(name), equipment_kits:equipment_kit_id(name)"
      )
      .eq("coach_id", coachId)
      .gte("date", today)
      .in("status", [
        "pending_confirmation",
        "confirmed",
        "in_progress",
      ])
      .order("date")
      .order("time")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("getCoachNextSession error:", error);
      return { data: null, error: "Failed to fetch next session." };
    }

    if (!raw) return { data: null, error: null };

    const mapped = mapSession(raw as unknown as Record<string, unknown>);
    const centre = (raw as unknown as Record<string, unknown>).centres as Record<
      string,
      unknown
    > | null;
    mapped.centre_contact_name =
      (centre?.primary_contact_name as string) ?? null;
    mapped.centre_contact_phone =
      (centre?.primary_contact_phone as string) ?? null;

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getCoachNextSession error:", err);
    return { data: null, error: "Failed to fetch next session." };
  }
}

// ============================================================
// 2. getCoachSessionsForDate
// ============================================================

export async function getCoachSessionsForDate(
  coachId: string,
  dateStr: string
): Promise<{ data: CoachSessionWithCentre[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: raw, error } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type, address), terms:term_id(name), equipment_kits:equipment_kit_id(name)"
      )
      .eq("coach_id", coachId)
      .eq("date", dateStr)
      .neq("status", "cancelled")
      .order("time");

    if (error) {
      console.error("getCoachSessionsForDate error:", error);
      return { data: null, error: "Failed to fetch sessions." };
    }

    const sessions = (raw ?? []).map((r) =>
      mapSession(r as unknown as Record<string, unknown>)
    );
    return { data: sessions, error: null };
  } catch (err) {
    console.error("getCoachSessionsForDate error:", err);
    return { data: null, error: "Failed to fetch sessions." };
  }
}

// ============================================================
// 3. getCoachSessionsForWeek
// ============================================================

export async function getCoachSessionsForWeek(
  coachId: string,
  weekStartDate: string
): Promise<{ data: CoachSessionWithCentre[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = new Date(weekStartDate + "T00:00:00");
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const weekEndDate = friday.toISOString().split("T")[0];

    const { data: raw, error } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type, address), terms:term_id(name), equipment_kits:equipment_kit_id(name)"
      )
      .eq("coach_id", coachId)
      .gte("date", weekStartDate)
      .lte("date", weekEndDate)
      .neq("status", "cancelled")
      .order("date")
      .order("time");

    if (error) {
      console.error("getCoachSessionsForWeek error:", error);
      return { data: null, error: "Failed to fetch sessions." };
    }

    const sessions = (raw ?? []).map((r) =>
      mapSession(r as unknown as Record<string, unknown>)
    );
    return { data: sessions, error: null };
  } catch (err) {
    console.error("getCoachSessionsForWeek error:", err);
    return { data: null, error: "Failed to fetch sessions." };
  }
}

// ============================================================
// 4. getCoachSessionsForTerm
// ============================================================

export async function getCoachSessionsForTerm(
  coachId: string,
  termId: string
): Promise<{ data: TermSessionSummary[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sessions")
      .select("id, date, status, sport")
      .eq("coach_id", coachId)
      .eq("term_id", termId)
      .neq("status", "cancelled")
      .order("date");

    if (error) {
      console.error("getCoachSessionsForTerm error:", error);
      return { data: null, error: "Failed to fetch term sessions." };
    }

    return {
      data: (data ?? []) as TermSessionSummary[],
      error: null,
    };
  } catch (err) {
    console.error("getCoachSessionsForTerm error:", err);
    return { data: null, error: "Failed to fetch term sessions." };
  }
}

// ============================================================
// 5. getCoachPendingActions
// ============================================================

export async function getCoachPendingActions(
  coachId: string
): Promise<{ data: PendingActionCounts | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const [shiftsRes, swapsRes, docsRes] = await Promise.all([
      // Shifts awaiting confirmation
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "pending_confirmation"),

      // Swap requests received (coach needs to respond)
      supabase
        .from("swap_requests")
        .select("id", { count: "exact", head: true })
        .eq("proposed_coach_id", coachId)
        .eq("status", "pending_coach"),

      // Compliance docs — check for missing or pending mandatory types
      supabase
        .from("compliance_docs")
        .select("doc_type, status")
        .eq("user_id", coachId)
        .in("doc_type", ["wwcc", "first_aid"]),
    ]);

    // Count missing mandatory docs
    const mandatoryTypes = ["wwcc", "first_aid"];
    const existingDocs = (docsRes.data ?? []) as {
      doc_type: string;
      status: string;
    }[];
    let onboardingItems = 0;

    for (const docType of mandatoryTypes) {
      const doc = existingDocs.find((d) => d.doc_type === docType);
      if (!doc || doc.status === "pending" || doc.status === "expired") {
        onboardingItems++;
      }
    }

    return {
      data: {
        pendingShifts: shiftsRes.count ?? 0,
        swapRequests: swapsRes.count ?? 0,
        onboardingItems,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCoachPendingActions error:", err);
    return { data: null, error: "Failed to fetch pending actions." };
  }
}

// ============================================================
// 6. getLatestAnnouncement
// ============================================================

export async function getLatestAnnouncement(
  userId: string
): Promise<{ data: AnnouncementWithRead | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: raw, error } = await supabase
      .from("announcements")
      .select("id, title, body, created_at, announcement_reads!left(user_id)")
      .in("audience", ["all", "ops_and_coaches", "coaches_only"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("getLatestAnnouncement error:", error);
      return { data: null, error: "Failed to fetch announcement." };
    }

    if (!raw) return { data: null, error: null };

    const reads = (raw.announcement_reads ?? []) as { user_id: string }[];
    const isRead = reads.some((r) => r.user_id === userId);

    return {
      data: {
        id: raw.id as string,
        title: raw.title as string,
        body: raw.body as string,
        created_at: raw.created_at as string,
        isRead,
      },
      error: null,
    };
  } catch (err) {
    console.error("getLatestAnnouncement error:", err);
    return { data: null, error: "Failed to fetch announcement." };
  }
}

// ============================================================
// 7. getCoachSessionDetail
// ============================================================

export async function getCoachSessionDetail(
  sessionId: string,
  coachId: string
): Promise<{ data: CoachSessionDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch session with centre and term
    const { data: raw, error: sessionErr } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type, address, primary_contact_name, primary_contact_phone, primary_contact_email), terms:term_id(name), equipment_kits:equipment_kit_id(name), session_coaches(user_id, is_primary, profiles:user_id(name))"
      )
      .eq("id", sessionId)
      .single();

    if (sessionErr || !raw) {
      return { data: null, error: "Session not found." };
    }

    // Security gate: verify this session belongs to the coach
    if (raw.coach_id !== coachId) {
      return { data: null, error: "Session not found." };
    }

    const centre = (raw as unknown as Record<string, unknown>).centres as Record<
      string,
      unknown
    > | null;
    const term = (raw as unknown as Record<string, unknown>).terms as Record<
      string,
      unknown
    > | null;
    const kit = (raw as unknown as Record<string, unknown>).equipment_kits as Record<
      string,
      unknown
    > | null;

    const session = {
      ...(raw as unknown as Session),
      centre_name: (centre?.name as string) ?? "Unknown",
      centre_type: (centre?.type as CentreType) ?? "childcare_centre",
      centre_address: (centre?.address as string) ?? null,
      term_name: (term?.name as string) ?? "",
      equipment_kit_name: (kit?.name as string) ?? null,
      centre_contact_name:
        (centre?.primary_contact_name as string) ?? null,
      centre_contact_phone:
        (centre?.primary_contact_phone as string) ?? null,
      centre_contact_email:
        (centre?.primary_contact_email as string) ?? null,
      assigned_coaches: (() => {
        const rows = ((raw as unknown as Record<string, unknown>).session_coaches as unknown as Array<{
          user_id: string;
          is_primary: boolean;
          profiles: { name: string | null } | null;
        }>) ?? [];
        return rows
          .map((sc) => ({
            user_id: sc.user_id,
            name: sc.profiles?.name ?? null,
            is_primary: sc.is_primary,
          }))
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      })(),
    };

    // Fetch related data in parallel
    const [notesRes, programRes, itemsRes, threadRes, feedbackRes] =
      await Promise.all([
        // Centre notes (coach-visible categories only)
        supabase
          .from("centre_notes")
          .select("id, category, content, created_at")
          .eq("centre_id", raw.centre_id)
          .in("category", ["general", "access_logistics", "safety"])
          .order("created_at", { ascending: false }),

        // Programme (if assigned)
        raw.program_id
          ? supabase
              .from("programs")
              .select("*")
              .eq("id", raw.program_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        // Equipment items (if kit assigned)
        raw.equipment_kit_id
          ? supabase
              .from("equipment_items")
              .select("id, item_type, quantity, condition")
              .eq("kit_id", raw.equipment_kit_id)
              .order("item_type")
          : Promise.resolve({ data: null, error: null }),

        // Shift thread messages with author names
        supabase
          .from("shift_threads")
          .select("id, content, user_id, created_at, updated_at, deleted_at, parent_message_id, profiles:user_id(name)")
          .eq("session_id", sessionId)
          .order("created_at"),

        // Feedback rating (if session is completed)
        raw.status === "completed"
          ? supabase
              .from("feedback_ratings")
              .select("*")
              .eq("session_id", sessionId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    // Map shift thread messages
    const rawThreadMessages = (threadRes.data ?? []) as unknown as Record<string, unknown>[];
    const shiftThread: ShiftThreadMessage[] = rawThreadMessages.map(
      (t) => ({
        id: t.id as string,
        content: t.content as string | null,
        user_id: t.user_id as string,
        created_at: t.created_at as string,
        updated_at: (t.updated_at as string | null) ?? null,
        deleted_at: (t.deleted_at as string | null) ?? null,
        parent_message_id: (t.parent_message_id as string | null) ?? null,
        author_name:
          ((t.profiles as unknown as Record<string, unknown> | null)?.name as string) ??
          "Unknown",
        reply_count: rawThreadMessages.filter(
          (r) => r.parent_message_id === t.id
        ).length,
      })
    );

    // Map equipment kit
    let equipmentKit: SessionEquipmentKit | null = null;
    if (raw.equipment_kit_id && kit) {
      // Fetch kit condition separately since the session join only gets name
      const { data: fullKit } = await supabase
        .from("equipment_kits")
        .select("id, name, condition")
        .eq("id", raw.equipment_kit_id)
        .maybeSingle();

      if (fullKit) {
        equipmentKit = fullKit as unknown as SessionEquipmentKit;
      }
    }

    return {
      data: {
        session,
        centreNotes: (notesRes.data ?? []) as SessionCentreNote[],
        program: programRes.data ?? null,
        equipmentKit,
        equipmentItems: (itemsRes.data ?? []) as SessionEquipmentItem[],
        shiftThread,
        feedback: (feedbackRes.data as FeedbackRating) ?? null,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCoachSessionDetail error:", err);
    return { data: null, error: "Failed to fetch session detail." };
  }
}

// ============================================================
// 8. addShiftThreadMessage
// ============================================================

export async function addShiftThreadMessage(
  sessionId: string,
  content: string,
  parentMessageId?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 2000) {
      return { error: "Message must be between 1 and 2000 characters." };
    }

    const insertData: Record<string, unknown> = {
      session_id: sessionId,
      user_id: user.id,
      content: trimmed,
    };
    if (parentMessageId) {
      insertData.parent_message_id = parentMessageId;
    }

    const { error } = await supabase.from("shift_threads").insert(insertData);

    if (error) {
      console.error("addShiftThreadMessage error:", error);
      return { error: "Failed to send message." };
    }

    // Notify other participants in the thread
    try {
      // Get distinct user_ids from the thread (excluding current user)
      const { data: threadUsers } = await supabase
        .from("shift_threads")
        .select("user_id")
        .eq("session_id", sessionId);

      // Also get the session's assigned coach
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("coach_id")
        .eq("id", sessionId)
        .single();

      const recipientIds = new Set<string>();
      for (const t of threadUsers ?? []) {
        if (t.user_id !== user.id) recipientIds.add(t.user_id);
      }
      if (sessionData?.coach_id && sessionData.coach_id !== user.id) {
        recipientIds.add(sessionData.coach_id);
      }

      if (recipientIds.size > 0) {
        const recipients = Array.from(recipientIds).map((userId) => ({
          userId,
        }));
        await triggerNotification(
          {
            type: "shift_thread_message",
            title: "New message on session thread",
            body: trimmed.substring(0, 100),
            entityType: "session",
            entityId: sessionId,
          },
          recipients
        );
      }
    } catch (notifyErr) {
      // Don't fail the message send if notifications fail
      console.error("Shift thread notification error:", notifyErr);
    }

    revalidatePath("/coach/schedule");
    return { error: null };
  } catch (err) {
    console.error("addShiftThreadMessage error:", err);
    return { error: "Failed to send message." };
  }
}

// ============================================================
// 8b. editShiftThreadMessage
// ============================================================

export async function editShiftThreadMessage(
  messageId: string,
  newContent: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    const trimmed = newContent.trim();
    if (!trimmed || trimmed.length > 2000) {
      return { error: "Message must be between 1 and 2000 characters." };
    }

    // Fetch the message and verify ownership
    const { data: message, error: fetchErr } = await supabase
      .from("shift_threads")
      .select("id, user_id, deleted_at")
      .eq("id", messageId)
      .single();

    if (fetchErr || !message) {
      return { error: "Message not found." };
    }

    if (message.user_id !== user.id) {
      return { error: "You can only edit your own messages." };
    }

    if (message.deleted_at) {
      return { error: "Cannot edit a deleted message." };
    }

    const { error } = await supabase
      .from("shift_threads")
      .update({
        content: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageId);

    if (error) {
      console.error("editShiftThreadMessage error:", error);
      return { error: "Failed to edit message." };
    }

    revalidatePath("/coach/schedule");
    return { error: null };
  } catch (err) {
    console.error("editShiftThreadMessage error:", err);
    return { error: "Failed to edit message." };
  }
}

// ============================================================
// 8c. deleteShiftThreadMessage
// ============================================================

export async function deleteShiftThreadMessage(
  messageId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    // Fetch the message and verify ownership
    const { data: message, error: fetchErr } = await supabase
      .from("shift_threads")
      .select("id, user_id, deleted_at")
      .eq("id", messageId)
      .single();

    if (fetchErr || !message) {
      return { error: "Message not found." };
    }

    if (message.user_id !== user.id) {
      return { error: "You can only delete your own messages." };
    }

    if (message.deleted_at) {
      return { error: "Message is already deleted." };
    }

    const { error } = await supabase
      .from("shift_threads")
      .update({
        content: null,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", messageId);

    if (error) {
      console.error("deleteShiftThreadMessage error:", error);
      return { error: "Failed to delete message." };
    }

    revalidatePath("/coach/schedule");
    return { error: null };
  } catch (err) {
    console.error("deleteShiftThreadMessage error:", err);
    return { error: "Failed to delete message." };
  }
}

// ============================================================
// 9. createSwapRequest
// ============================================================

export async function createSwapRequest(
  sessionId: string,
  proposedCoachId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    // Verify session belongs to requesting coach and is confirmed
    const { data: session } = await supabase
      .from("sessions")
      .select("id, coach_id, status")
      .eq("id", sessionId)
      .single();

    if (!session || session.coach_id !== user.id) {
      return { error: "Session not found." };
    }

    if (session.status !== "confirmed") {
      return { error: "Only confirmed sessions can be swapped." };
    }

    // Check for existing pending swap request
    const { data: existing } = await supabase
      .from("swap_requests")
      .select("id")
      .eq("session_id", sessionId)
      .in("status", ["pending_coach", "pending_ops"])
      .maybeSingle();

    if (existing) {
      return { error: "A swap request already exists for this session." };
    }

    const { error } = await supabase.from("swap_requests").insert({
      session_id: sessionId,
      requesting_coach_id: user.id,
      proposed_coach_id: proposedCoachId,
      status: "pending_coach",
    });

    if (error) {
      console.error("createSwapRequest error:", error);
      return { error: "Failed to create swap request." };
    }

    return { error: null };
  } catch (err) {
    console.error("createSwapRequest error:", err);
    return { error: "Failed to create swap request." };
  }
}

// ============================================================
// 10. getCoachPendingSessions
// ============================================================

/**
 * Fetch all pending_confirmation sessions for a coach.
 * Used by the bulk confirm dialog.
 */
export async function getCoachPendingSessions(
  coachId: string
): Promise<{
  data: { id: string; date: string; time: string; sport: string; centre_name: string }[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sessions")
      .select("id, date, time, sport, centres:centre_id(name)")
      .eq("coach_id", coachId)
      .eq("status", "pending_confirmation")
      .order("date")
      .order("time");

    if (error) throw error;

    const mapped = (data ?? []).map((r: Record<string, unknown>) => {
      const centre = r.centres as unknown as Record<string, unknown> | null;
      return {
        id: r.id as string,
        date: r.date as string,
        time: r.time as string,
        sport: r.sport as string,
        centre_name: (centre?.name as string) ?? "Unknown",
      };
    });

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getCoachPendingSessions error:", err);
    return { data: null, error: "Failed to fetch pending sessions." };
  }
}
