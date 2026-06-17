"use server";

// ============================================================
// Unified inbox — server actions
// ============================================================
//
// `getInboxItems` fans out across 8 sources for the admin/ops
// viewer (coaches are excluded — they have their own surfaces
// already and `/coach/inbox` is intentionally not part of this
// feature).
//
// Each source query is wrapped in a try/catch — a single broken
// fan-out leg returns [] rather than blanking the whole inbox.
// Results merge, sort by tier (urgent > important > informational)
// then createdAt desc, cap at INBOX_LIMIT (100).
//
// `acknowledgeInboxItem` is the unified quick-action dispatcher —
// it switches on (source, action) and writes activity_log per call
// so the audit trail stays intact.
//
// `getInboxCounts` is the sidebar-badge feed — same fan-out, just
// roll up to a `{ urgent, important, informational }` tally.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification } from "@/lib/notifications/send";
import { opsApproveSwap, opsRejectSwap } from "@/lib/sessions/shift-actions";
import {
  INBOX_LIMIT,
  INBOX_TIER_ORDER,
  type InboxCounts,
  type InboxFilters,
  type InboxItem,
  type InboxSource,
  type InboxTier,
} from "./types";

type ViewerRole = "admin" | "ops" | "coach" | "parent";

interface InboxGate {
  ok: boolean;
  userId: string;
  role: ViewerRole | null;
  error: string | null;
}

/**
 * Resolve the viewer, confirm they're admin/ops. Returns ok=false
 * for coach/parent/anonymous — they don't get an inbox view.
 */
async function gateAdminOrOps(): Promise<InboxGate> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, userId: "", role: null, error: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? null) as ViewerRole | null;
  if (role !== "admin" && role !== "ops") {
    return {
      ok: false,
      userId: user.id,
      role,
      error: "Inbox is admin/ops only.",
    };
  }
  return { ok: true, userId: user.id, role, error: null };
}

// ============================================================
// Source: tasks
// ============================================================

async function loadTaskItems(viewerId: string): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();

    // Pull final-column ids so we exclude completed tasks (same
    // pattern as tasks-status-pulse).
    const { data: finalCols } = await supabase
      .from("task_columns")
      .select("id")
      .eq("is_final", true);
    const finalIds = (finalCols ?? [])
      .map((c: { id: string }) => c.id)
      .filter(Boolean);

    let query = supabase
      .from("tasks")
      .select("id, title, description, priority, due_date, created_at, column_id")
      .eq("assignee_id", viewerId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(INBOX_LIMIT);

    if (finalIds.length > 0) {
      query = query.not("column_id", "in", `(${finalIds.join(",")})`);
    }

    const { data } = await query;
    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      description: string | null;
      priority: string;
      due_date: string | null;
      created_at: string;
    }>;

    const today = new Date().toISOString().slice(0, 10);

    return rows.map((task) => {
      const overdue = task.due_date && task.due_date < today;
      const dueToday = task.due_date && task.due_date === today;
      const tier: InboxTier = overdue
        ? "urgent"
        : dueToday || task.priority === "high"
          ? "important"
          : "informational";
      return {
        id: task.id,
        source: "task",
        sourceLabel: "Task",
        title: task.title,
        description: task.description,
        createdAt: task.created_at,
        dueAt: task.due_date,
        tier,
        href: `/admin/tasks?task=${task.id}`,
        entity: { type: null, id: null, label: null },
        actions: [
          { key: "complete", label: "Complete" },
          { key: "open", label: "Open" },
        ],
      };
    });
  } catch (err) {
    console.error("inbox/loadTaskItems error:", err);
    return [];
  }
}

// ============================================================
// Source: notifications
// ============================================================

async function loadNotificationItems(viewerId: string): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, tier, entity_type, entity_id, created_at")
      .eq("user_id", viewerId)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      tier: InboxTier;
      entity_type: string | null;
      entity_id: string | null;
      created_at: string;
    }>;

    return rows.map((n) => ({
      id: n.id,
      source: "notification",
      sourceLabel: "Notification",
      title: n.title,
      description: n.body,
      createdAt: n.created_at,
      dueAt: null,
      tier: n.tier ?? "informational",
      href: hrefForNotificationEntity(n.entity_type, n.entity_id),
      entity: {
        type: null,
        id: n.entity_id,
        label: n.entity_type,
      },
      actions: [
        { key: "mark_read", label: "Mark read" },
        { key: "open", label: "Open" },
      ],
    }));
  } catch (err) {
    console.error("inbox/loadNotificationItems error:", err);
    return [];
  }
}

function hrefForNotificationEntity(
  type: string | null,
  id: string | null,
): string {
  if (!type || !id) return "/admin";
  switch (type) {
    case "task":
      return `/admin/tasks?task=${id}`;
    case "session":
      return `/admin/roster?session=${id}`;
    case "swap_request":
      return `/admin/roster?swap=${id}`;
    case "centre":
      return `/admin/centres/${id}`;
    case "feedback":
      return `/admin/feedback?id=${id}`;
    case "message":
      return `/admin/messages`;
    default:
      return "/admin";
  }
}

// ============================================================
// Source: flagged feedback (rating ≤ 2, unacknowledged)
// ============================================================

async function loadFlaggedFeedbackItems(): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("feedback_ratings")
      .select(
        "id, rating, comment, sport, centre_id, submitted_at, created_at, centres:centre_id(name)",
      )
      .lte("rating", 2)
      .is("acknowledged_at", null)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      rating: number | null;
      comment: string | null;
      sport: string | null;
      centre_id: string;
      submitted_at: string | null;
      created_at: string;
      centres: { name: string } | { name: string }[] | null;
    }>;

    return rows.map((fb) => {
      const centre = Array.isArray(fb.centres) ? fb.centres[0] : fb.centres;
      const centreName = centre?.name ?? "centre";
      return {
        id: fb.id,
        source: "flagged_feedback",
        sourceLabel: "Flagged feedback",
        title: `${fb.rating}-star feedback from ${centreName}`,
        description: fb.comment,
        createdAt: fb.submitted_at ?? fb.created_at,
        dueAt: null,
        tier: "urgent",
        href: `/admin/feedback?flagged=yes`,
        entity: {
          type: "feedback",
          id: fb.id,
          label: centreName,
        },
        actions: [
          { key: "acknowledge", label: "Acknowledge" },
          { key: "open", label: "Open" },
        ],
      };
    });
  } catch (err) {
    console.error("inbox/loadFlaggedFeedbackItems error:", err);
    return [];
  }
}

// ============================================================
// Source: needs_replacement shifts
// ============================================================

async function loadNeedsReplacementItems(): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("sessions")
      .select(
        "id, sport, date, time, centre_id, updated_at, centres:centre_id(name)",
      )
      .eq("status", "needs_replacement")
      .order("date", { ascending: true })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      sport: string;
      date: string;
      time: string;
      centre_id: string;
      updated_at: string;
      centres: { name: string } | { name: string }[] | null;
    }>;

    return rows.map((s) => {
      const centre = Array.isArray(s.centres) ? s.centres[0] : s.centres;
      const centreName = centre?.name ?? "centre";
      return {
        id: s.id,
        source: "needs_replacement_shift",
        sourceLabel: "Cover needed",
        title: `Cover needed — ${s.sport} @ ${centreName}`,
        description: `${s.date} ${s.time}`,
        createdAt: s.updated_at,
        dueAt: s.date,
        tier: "urgent",
        href: `/admin/roster?session=${s.id}`,
        entity: { type: "session", id: s.id, label: centreName },
        actions: [
          { key: "reassign", label: "Reassign" },
          { key: "open", label: "Open" },
        ],
      };
    });
  } catch (err) {
    console.error("inbox/loadNeedsReplacementItems error:", err);
    return [];
  }
}

// ============================================================
// Source: unread direct messages (thread heads)
// ============================================================

async function loadUnreadMessageItems(viewerId: string): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, content, created_at, sender:sender_id(name)")
      .eq("recipient_id", viewerId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      sender_id: string;
      content: string | null;
      created_at: string;
      sender: { name: string } | { name: string }[] | null;
    }>;

    // Collapse to one-per-sender (newest wins). That's the "thread
    // head" the spec calls for without a full thread-mapping pass.
    const seen = new Set<string>();
    const items: InboxItem[] = [];
    for (const m of rows) {
      if (seen.has(m.sender_id)) continue;
      seen.add(m.sender_id);
      const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
      const senderName = sender?.name ?? "Unknown";
      items.push({
        id: m.id,
        source: "unread_message",
        sourceLabel: "Message",
        title: `New message from ${senderName}`,
        description: m.content,
        createdAt: m.created_at,
        dueAt: null,
        tier: "important",
        href: `/admin/messages`,
        entity: { type: "message", id: m.sender_id, label: senderName },
        actions: [{ key: "open", label: "Open" }],
      });
    }
    return items;
  } catch (err) {
    console.error("inbox/loadUnreadMessageItems error:", err);
    return [];
  }
}

// ============================================================
// Source: churn alerts (centres with churn_risk + health < 40)
// ============================================================

async function loadChurnAlertItems(): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("centres")
      .select("id, name, health_score, churn_risk, updated_at")
      .eq("churn_risk", true)
      .lt("health_score", 40)
      .order("health_score", { ascending: true })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      health_score: number | null;
      churn_risk: boolean;
      updated_at: string;
    }>;

    return rows.map((c) => ({
      id: c.id,
      source: "churn_alert",
      sourceLabel: "Churn risk",
      title: `Churn risk — ${c.name}`,
      description: `Health score ${c.health_score ?? "n/a"} — flagged for retention`,
      createdAt: c.updated_at,
      dueAt: null,
      tier: "urgent",
      href: `/admin/centres/${c.id}`,
      entity: { type: "centre", id: c.id, label: c.name },
      actions: [{ key: "open_centre", label: "Open centre" }],
    }));
  } catch (err) {
    console.error("inbox/loadChurnAlertItems error:", err);
    return [];
  }
}

// ============================================================
// Source: unconfirmed shifts (pending_confirmation, next 7d)
// ============================================================

async function loadUnconfirmedShiftItems(): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 7);
    const horizonIso = horizon.toISOString().slice(0, 10);

    const { data } = await supabase
      .from("sessions")
      .select(
        "id, sport, date, time, coach_id, centre_id, updated_at, centres:centre_id(name), coach:coach_id(name)",
      )
      .eq("status", "pending_confirmation")
      .gte("date", todayIso)
      .lte("date", horizonIso)
      .order("date", { ascending: true })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      sport: string;
      date: string;
      time: string;
      coach_id: string | null;
      centre_id: string;
      updated_at: string;
      centres: { name: string } | { name: string }[] | null;
      coach: { name: string } | { name: string }[] | null;
    }>;

    return rows.map((s) => {
      const centre = Array.isArray(s.centres) ? s.centres[0] : s.centres;
      const coach = Array.isArray(s.coach) ? s.coach[0] : s.coach;
      const centreName = centre?.name ?? "centre";
      const coachName = coach?.name ?? "coach";
      return {
        id: s.id,
        source: "unconfirmed_shift",
        sourceLabel: "Unconfirmed",
        title: `Awaiting confirmation — ${coachName} for ${s.sport}`,
        description: `${s.date} ${s.time} @ ${centreName}`,
        createdAt: s.updated_at,
        dueAt: s.date,
        tier: "important",
        href: `/admin/roster?session=${s.id}`,
        entity: { type: "coach", id: s.coach_id, label: coachName },
        actions: [
          { key: "remind", label: "Remind" },
          { key: "open", label: "Open" },
        ],
      };
    });
  } catch (err) {
    console.error("inbox/loadUnconfirmedShiftItems error:", err);
    return [];
  }
}

// ============================================================
// Source: swap requests (status=pending_ops)
// ============================================================

async function loadSwapRequestItems(): Promise<InboxItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("swap_requests")
      .select(
        "id, session_id, requesting_coach_id, proposed_coach_id, created_at, sessions:session_id(sport, date, time, centres:centre_id(name)), requesting:requesting_coach_id(name), proposed:proposed_coach_id(name)",
      )
      .eq("status", "pending_ops")
      .order("created_at", { ascending: false })
      .limit(INBOX_LIMIT);

    const rows = (data ?? []) as Array<{
      id: string;
      session_id: string;
      requesting_coach_id: string;
      proposed_coach_id: string;
      created_at: string;
      sessions:
        | { sport: string; date: string; time: string; centres: { name: string } | { name: string }[] | null }
        | { sport: string; date: string; time: string; centres: { name: string } | { name: string }[] | null }[]
        | null;
      requesting: { name: string } | { name: string }[] | null;
      proposed: { name: string } | { name: string }[] | null;
    }>;

    return rows.map((sr) => {
      const session = Array.isArray(sr.sessions) ? sr.sessions[0] : sr.sessions;
      const centre = session
        ? Array.isArray(session.centres)
          ? session.centres[0]
          : session.centres
        : null;
      const requesting = Array.isArray(sr.requesting)
        ? sr.requesting[0]
        : sr.requesting;
      const proposed = Array.isArray(sr.proposed) ? sr.proposed[0] : sr.proposed;
      const requestingName = requesting?.name ?? "coach";
      const proposedName = proposed?.name ?? "coach";
      const centreName = centre?.name ?? "centre";
      const sport = session?.sport ?? "session";
      return {
        id: sr.id,
        source: "swap_request",
        sourceLabel: "Swap request",
        title: `Swap: ${requestingName} → ${proposedName} (${sport})`,
        description: session
          ? `${session.date} ${session.time} @ ${centreName}`
          : null,
        createdAt: sr.created_at,
        dueAt: session?.date ?? null,
        tier: "important",
        href: `/admin/roster?swap=${sr.id}`,
        entity: { type: "session", id: sr.session_id, label: centreName },
        actions: [
          { key: "approve", label: "Approve" },
          { key: "deny", label: "Deny", variant: "destructive" },
        ],
      };
    });
  } catch (err) {
    console.error("inbox/loadSwapRequestItems error:", err);
    return [];
  }
}

// ============================================================
// getInboxItems — orchestrator
// ============================================================

export async function getInboxItems(
  viewerRole: ViewerRole,
  filters?: InboxFilters,
): Promise<{ data: InboxItem[]; error: string | null }> {
  if (viewerRole !== "admin" && viewerRole !== "ops") {
    return { data: [], error: "Inbox is admin/ops only." };
  }

  const gate = await gateAdminOrOps();
  if (!gate.ok) return { data: [], error: gate.error };

  const [
    tasks,
    notifications,
    flaggedFeedback,
    needsReplacement,
    unreadMessages,
    churnAlerts,
    unconfirmedShifts,
    swapRequests,
  ] = await Promise.all([
    loadTaskItems(gate.userId),
    loadNotificationItems(gate.userId),
    loadFlaggedFeedbackItems(),
    loadNeedsReplacementItems(),
    loadUnreadMessageItems(gate.userId),
    loadChurnAlertItems(),
    loadUnconfirmedShiftItems(),
    loadSwapRequestItems(),
  ]);

  let merged: InboxItem[] = [
    ...tasks,
    ...notifications,
    ...flaggedFeedback,
    ...needsReplacement,
    ...unreadMessages,
    ...churnAlerts,
    ...unconfirmedShifts,
    ...swapRequests,
  ];

  // Source filter
  if (filters?.source) {
    merged = merged.filter((item) => item.source === filters.source);
  }

  // Sort: tier asc (urgent first), then createdAt desc.
  merged.sort((a, b) => {
    const tierDiff = INBOX_TIER_ORDER[a.tier] - INBOX_TIER_ORDER[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  return { data: merged.slice(0, INBOX_LIMIT), error: null };
}

// ============================================================
// getInboxCounts — sidebar badge feed
// ============================================================

export async function getInboxCounts(): Promise<InboxCounts> {
  const gate = await gateAdminOrOps();
  if (!gate.ok) {
    return { urgent: 0, important: 0, informational: 0 };
  }

  const { data } = await getInboxItems(gate.role as ViewerRole);
  const counts: InboxCounts = { urgent: 0, important: 0, informational: 0 };
  for (const item of data) {
    counts[item.tier] += 1;
  }
  return counts;
}

// ============================================================
// acknowledgeInboxItem — unified dispatcher
// ============================================================

export async function acknowledgeInboxItem(
  source: InboxSource,
  id: string,
  action: string,
): Promise<{ error: string | null; redirectTo?: string }> {
  const gate = await gateAdminOrOps();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createSupabaseServerClient();

  try {
    switch (source) {
      case "task": {
        if (action !== "complete") {
          return { error: `Unsupported action "${action}" for task.` };
        }
        const { data: finalCol } = await supabase
          .from("task_columns")
          .select("id")
          .eq("is_final", true)
          .order("position", { ascending: true })
          .limit(1)
          .single();
        if (!finalCol) return { error: "No final column configured." };

        const { error } = await supabase
          .from("tasks")
          .update({ column_id: finalCol.id, column_order: 0 })
          .eq("id", id);
        if (error) return { error: error.message };

        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_task_completed",
          entity_type: "task",
          entity_id: id,
          metadata: { source, action },
        });
        return { error: null };
      }

      case "notification": {
        if (action !== "mark_read") {
          return { error: `Unsupported action "${action}" for notification.` };
        }
        const { error } = await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", id)
          .eq("user_id", gate.userId);
        if (error) return { error: error.message };
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_notification_read",
          entity_type: "notification",
          entity_id: id,
          metadata: { source, action },
        });
        return { error: null };
      }

      case "flagged_feedback": {
        if (action !== "acknowledge") {
          return {
            error: `Unsupported action "${action}" for flagged feedback.`,
          };
        }
        const { error } = await supabase
          .from("feedback_ratings")
          .update({
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: gate.userId,
          })
          .eq("id", id)
          .is("acknowledged_at", null);
        if (error) return { error: error.message };
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_feedback_acknowledged",
          entity_type: "feedback_ratings",
          entity_id: id,
          metadata: { source, action },
        });
        return { error: null };
      }

      case "needs_replacement_shift": {
        // Routed back to roster — no DB write, just an audit row +
        // redirect to the assignment surface.
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_reassign_opened",
          entity_type: "session",
          entity_id: id,
          metadata: { source, action },
        });
        return { error: null, redirectTo: `/admin/roster?session=${id}` };
      }

      case "unconfirmed_shift": {
        if (action !== "remind") {
          return { error: `Unsupported action "${action}" for shift.` };
        }
        // Look up the coach so we can route the reminder notification.
        const { data: session } = await supabase
          .from("sessions")
          .select("coach_id, sport, date, time, centre_id, centres:centre_id(name)")
          .eq("id", id)
          .single();
        if (!session || !session.coach_id) {
          return { error: "Cannot remind — no coach assigned." };
        }
        const centre = Array.isArray(session.centres)
          ? session.centres[0]
          : session.centres;
        const centreName = (centre as { name: string } | null)?.name ?? "centre";
        await triggerNotification(
          {
            type: "shift_reminder",
            title: "Please confirm your shift",
            body: `Reminder: confirm your ${session.sport} shift on ${session.date} ${session.time} at ${centreName}.`,
            entityType: "session",
            entityId: id,
          },
          [{ userId: session.coach_id }],
        );
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_shift_reminder_sent",
          entity_type: "session",
          entity_id: id,
          metadata: { source, action, coach_id: session.coach_id },
        });
        return { error: null };
      }

      case "churn_alert": {
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_churn_opened",
          entity_type: "centre",
          entity_id: id,
          metadata: { source, action },
        });
        return { error: null, redirectTo: `/admin/centres/${id}` };
      }

      case "swap_request": {
        if (action === "approve") {
          const { error } = await opsApproveSwap(id);
          if (error) return { error };
          await supabase.from("activity_log").insert({
            user_id: gate.userId,
            action: "inbox_swap_approved",
            entity_type: "swap_request",
            entity_id: id,
            metadata: { source, action },
          });
          return { error: null };
        }
        if (action === "deny") {
          const { error } = await opsRejectSwap(id);
          if (error) return { error };
          await supabase.from("activity_log").insert({
            user_id: gate.userId,
            action: "inbox_swap_denied",
            entity_type: "swap_request",
            entity_id: id,
            metadata: { source, action },
          });
          return { error: null };
        }
        return { error: `Unsupported action "${action}" for swap_request.` };
      }

      case "unread_message": {
        // Mark messages from this sender as read.
        const { error } = await supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("sender_id", id)
          .eq("recipient_id", gate.userId)
          .is("read_at", null);
        if (error) return { error: error.message };
        await supabase.from("activity_log").insert({
          user_id: gate.userId,
          action: "inbox_message_read",
          entity_type: "direct_messages",
          entity_id: id,
          metadata: { source, action },
        });
        return { error: null, redirectTo: `/admin/messages` };
      }

      default:
        return { error: `Unsupported source "${source}".` };
    }
  } catch (err) {
    console.error("acknowledgeInboxItem error:", err);
    return { error: "Failed to acknowledge item." };
  }
}
