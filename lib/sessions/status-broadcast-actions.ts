"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendUrgentNotificationViaSms } from "@/lib/sms/actions";

// ============================================================
// Types
// ============================================================

export type SessionStatusBroadcastType =
  | "running_late"
  | "on_site"
  | "session_over";

export type BroadcastAudience = "centre" | "admin" | "parents";

export interface SessionStatusBroadcast {
  id: string;
  session_id: string;
  coach_id: string;
  coach_name: string | null;
  status: SessionStatusBroadcastType;
  late_minutes: number | null;
  message: string | null;
  broadcast_to: BroadcastAudience[];
  created_at: string;
}

export interface BroadcastSessionStatusInput {
  sessionId: string;
  status: SessionStatusBroadcastType;
  /** Only honoured (and required) when status === 'running_late'. */
  lateMinutes?: number;
  /** Optional free-text the coach can add (max 100 chars). */
  message?: string;
  /** Optional override; if omitted we use the per-status defaults below. */
  broadcastTo?: BroadcastAudience[];
}

export interface BroadcastSessionStatusResult {
  id: string | null;
  error: string | null;
}

// ============================================================
// Defaults
// ============================================================

/**
 * Sensible defaults for who hears about each status. These can be
 * overridden by the caller (the coach picks audience chips in the UI).
 *
 * - `running_late` is the loud one — every parent of every kid in the
 *   session deserves a heads-up so they don't show up wondering where
 *   the coach is.
 * - `on_site` is reassurance for the centre + admin/ops triage.
 * - `session_over` is a low-noise wrap-up signal — admin only by default
 *   so we don't ping parents twice (they already have the photo/feedback
 *   post-session emails).
 */
const DEFAULT_AUDIENCE: Record<
  SessionStatusBroadcastType,
  BroadcastAudience[]
> = {
  running_late: ["centre", "admin", "parents"],
  on_site: ["centre", "admin"],
  session_over: ["admin"],
};

const TIER_MAP: Record<
  SessionStatusBroadcastType,
  "urgent" | "important" | "informational"
> = {
  running_late: "urgent",
  on_site: "important",
  session_over: "informational",
};

const MAX_MESSAGE_CHARS = 100;
const ALLOWED_LATE_MINUTES = new Set([5, 10, 15, 20, 30]);

// ============================================================
// broadcastSessionStatus
// ============================================================

/**
 * Coach 3-tap status broadcast.
 *
 * Verifies the caller is assigned to the session via `session_coaches`,
 * inserts the audit row in `session_status_broadcasts`, then fans out
 * `notifications` rows to the configured audiences. For `running_late`
 * we also escalate to SMS for any opted-in admin/ops on call.
 *
 * Returns `{ id, error }`. The id is null on any failure path.
 */
export async function broadcastSessionStatus(
  input: BroadcastSessionStatusInput,
): Promise<BroadcastSessionStatusResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, error: "Not authenticated." };

  // ----------------------------------------------------------
  // 1. Validate input shape
  // ----------------------------------------------------------
  if (
    input.status !== "running_late" &&
    input.status !== "on_site" &&
    input.status !== "session_over"
  ) {
    return { id: null, error: "Invalid status." };
  }
  if (input.status === "running_late") {
    if (
      typeof input.lateMinutes !== "number" ||
      !ALLOWED_LATE_MINUTES.has(input.lateMinutes)
    ) {
      return {
        id: null,
        error: "running_late requires lateMinutes ∈ {5,10,15,20,30}.",
      };
    }
  }
  if (input.message && input.message.length > MAX_MESSAGE_CHARS) {
    return {
      id: null,
      error: `Message must be ${MAX_MESSAGE_CHARS} characters or less.`,
    };
  }

  const audience: BroadcastAudience[] =
    input.broadcastTo && input.broadcastTo.length > 0
      ? Array.from(new Set(input.broadcastTo))
      : DEFAULT_AUDIENCE[input.status];

  // ----------------------------------------------------------
  // 2. Auth gate — the caller must be a coach on this shift
  // ----------------------------------------------------------
  const { data: assignment, error: assignmentError } = await supabase
    .from("session_coaches")
    .select("user_id")
    .eq("session_id", input.sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (assignmentError) {
    return { id: null, error: assignmentError.message };
  }
  if (!assignment) {
    return {
      id: null,
      error: "Only coaches assigned to this session can broadcast a status.",
    };
  }

  // ----------------------------------------------------------
  // 3. Insert the broadcast row (RLS: coach can insert own)
  // ----------------------------------------------------------
  const { data: broadcast, error: insertError } = await supabase
    .from("session_status_broadcasts")
    .insert({
      session_id: input.sessionId,
      coach_id: user.id,
      status: input.status,
      late_minutes:
        input.status === "running_late" ? (input.lateMinutes ?? null) : null,
      message: input.message ?? null,
      broadcast_to: audience,
    })
    .select("id")
    .single();
  if (insertError || !broadcast) {
    return {
      id: null,
      error: insertError?.message ?? "Failed to record broadcast.",
    };
  }

  // ----------------------------------------------------------
  // 4. Fan-out — uses the admin client because we're inserting
  //    notifications for OTHER users (RLS would block otherwise),
  //    and we need to look across roles/centres/parents.
  // ----------------------------------------------------------
  const admin = createSupabaseAdmin();
  const tier = TIER_MAP[input.status];

  // Coach name for notification copy.
  const { data: coachProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const coachName = coachProfile?.name ?? "Your coach";

  // Session metadata for notification body + parent fan-out.
  const { data: sessionRow } = await admin
    .from("sessions")
    .select("id, centre_id, date, time")
    .eq("id", input.sessionId)
    .maybeSingle();
  const centreId = sessionRow?.centre_id ?? null;

  const { title, body } = buildNotificationCopy({
    coachName,
    status: input.status,
    lateMinutes: input.lateMinutes,
    message: input.message,
  });

  const recipientIds = new Set<string>();

  // 4a. Admin/ops cohort (skip DND).
  if (audience.includes("admin")) {
    const { data: opsUsers } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "ops"])
      .eq("dnd_enabled", false);
    for (const u of opsUsers ?? []) {
      if (u.id !== user.id) recipientIds.add(u.id);
    }
  }

  // 4b. Centre portal directors via client_user_centres → client_users.user_id.
  if (audience.includes("centre") && centreId) {
    const { data: linked } = await admin
      .from("client_user_centres")
      .select("client_users:client_user_id(user_id)")
      .eq("centre_id", centreId);
    for (const row of linked ?? []) {
      const cu = row.client_users as unknown as { user_id: string } | null;
      if (cu?.user_id) recipientIds.add(cu.user_id);
    }
  }

  // 4c. Parents — only for running_late by default. Walk
  // session → bookable_session → bookings.parent_id → parent_profiles.user_id.
  // bookings.parent_id is parent_profiles.id; we need auth.user_id for
  // the notifications row so the right inbox shows it.
  if (audience.includes("parents") && centreId) {
    const { data: bookable } = await admin
      .from("bookable_sessions")
      .select("id")
      .eq("session_id", input.sessionId);
    const bookableIds = (bookable ?? []).map((b) => b.id);
    if (bookableIds.length > 0) {
      const { data: bookingsRows } = await admin
        .from("bookings")
        .select("parent_id, status")
        .in("bookable_session_id", bookableIds)
        .neq("status", "cancelled");
      const parentProfileIds = Array.from(
        new Set(
          (bookingsRows ?? [])
            .map((b) => b.parent_id)
            .filter((id): id is string => !!id),
        ),
      );
      if (parentProfileIds.length > 0) {
        const { data: parents } = await admin
          .from("parent_profiles")
          .select("user_id")
          .in("id", parentProfileIds);
        for (const p of parents ?? []) {
          if (p.user_id) recipientIds.add(p.user_id);
        }
      }
    }
  }

  // 4d. Insert all notifications in a single batch.
  const notificationRows = Array.from(recipientIds).map((uid) => ({
    user_id: uid,
    type: "coach_session_status_broadcast",
    title,
    body,
    tier,
    entity_type: "session",
    entity_id: input.sessionId,
    data: {
      broadcast_id: broadcast.id,
      status: input.status,
      late_minutes: input.lateMinutes ?? null,
      message: input.message ?? null,
      coach_id: user.id,
      coach_name: coachName,
    },
    read: false,
  }));

  let insertedNotifications: { id: string; user_id: string }[] = [];
  if (notificationRows.length > 0) {
    const { data: inserted } = await admin
      .from("notifications")
      .insert(notificationRows)
      .select("id, user_id");
    insertedNotifications = inserted ?? [];
  }

  // 4e. SMS fallback for opted-in admins on running_late.
  if (input.status === "running_late" && insertedNotifications.length > 0) {
    // sendUrgentNotificationViaSms inspects tier + opt-in itself, so
    // we can fire-and-forget for every recipient — non-eligible ones
    // skip silently. Awaited in series so a flaky provider can't
    // explode under a wide parent fan-out.
    for (const n of insertedNotifications) {
      try {
        await sendUrgentNotificationViaSms(n.id);
      } catch {
        // Provider failures are logged inside the helper; swallow
        // here so one bad SMS doesn't poison the whole broadcast.
      }
    }
  }

  // ----------------------------------------------------------
  // 5. Activity log audit
  // ----------------------------------------------------------
  await admin.from("activity_log").insert({
    action: "coach_session_status_broadcast",
    actor_id: user.id,
    entity_type: "session",
    entity_id: input.sessionId,
    metadata: {
      broadcast_id: broadcast.id,
      status: input.status,
      late_minutes: input.lateMinutes ?? null,
      audience,
      recipient_count: recipientIds.size,
      message: input.message ?? null,
    },
  });

  // Revalidate surfaces that show broadcasts.
  revalidatePath("/coach/schedule");
  revalidatePath(`/coach/schedule/${input.sessionId}`);

  return { id: broadcast.id, error: null };
}

// ============================================================
// getSessionStatusBroadcasts (helper for detail views)
// ============================================================

export async function getSessionStatusBroadcasts(
  sessionId: string,
): Promise<{ data: SessionStatusBroadcast[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("session_status_broadcasts")
    .select(
      "id, session_id, coach_id, status, late_minutes, message, broadcast_to, created_at, profiles:coach_id(name)",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };

  const rows: SessionStatusBroadcast[] = (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { name: string | null } | null;
    return {
      id: row.id,
      session_id: row.session_id,
      coach_id: row.coach_id,
      coach_name: profile?.name ?? null,
      status: row.status as SessionStatusBroadcastType,
      late_minutes: row.late_minutes ?? null,
      message: row.message ?? null,
      broadcast_to: (row.broadcast_to ?? []) as BroadcastAudience[],
      created_at: row.created_at,
    };
  });

  return { data: rows, error: null };
}

// ============================================================
// getRecentBroadcastForSession (5-min freshness pill on cards)
// ============================================================

export async function getRecentBroadcastForSession(
  sessionId: string,
  withinMinutes: number = 60,
): Promise<{
  data: SessionStatusBroadcast | null;
  error: string | null;
}> {
  const { data, error } = await getSessionStatusBroadcasts(sessionId);
  if (error) return { data: null, error };
  if (data.length === 0) return { data: null, error: null };

  const head = data[0];
  const ageMs = Date.now() - new Date(head.created_at).getTime();
  if (ageMs > withinMinutes * 60_000) return { data: null, error: null };
  return { data: head, error: null };
}

// ============================================================
// Internal — notification copy builder
// ============================================================

function buildNotificationCopy(args: {
  coachName: string;
  status: SessionStatusBroadcastType;
  lateMinutes?: number;
  message?: string;
}): { title: string; body: string } {
  const { coachName, status, lateMinutes, message } = args;
  let title: string;
  let body: string;

  if (status === "running_late") {
    title = `${coachName} is running ${lateMinutes ?? "a few"} min late`;
    body = message
      ? `Your coach: "${message}"`
      : `Heads up — the session will start a little later than scheduled.`;
  } else if (status === "on_site") {
    title = `${coachName} is on site`;
    body = message ?? `Coach has arrived and is setting up.`;
  } else {
    title = `${coachName} marked the session over`;
    body = message ?? `Session wrapped up.`;
  }
  // Defensive truncation — title appears on lockscreens.
  if (title.length > 120) title = `${title.slice(0, 117)}...`;
  if (body.length > 240) body = `${body.slice(0, 237)}...`;
  return { title, body };
}
