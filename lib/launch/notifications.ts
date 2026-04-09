"use server";

// ============================================================
// Launch Foundation — In-app notifications utility
// Uses the admin Supabase client to insert into the notifications table
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationType } from "./types";

// ========================
// createNotification — single insert
// ========================
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createSupabaseAdmin();

  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.message,
    tier: getTier(params.type),
    action_url: params.actionUrl || null,
    metadata: params.metadata || {},
  });

  if (error) {
    console.error("createNotification error:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ========================
// createBulkNotifications — batch insert
// ========================
export async function createBulkNotifications(
  notifications: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<{ success: boolean; count: number; error?: string }> {
  if (notifications.length === 0) {
    return { success: true, count: 0 };
  }

  const supabase = createSupabaseAdmin();

  const rows = notifications.map((n) => ({
    user_id: n.userId,
    type: n.type,
    title: n.title,
    body: n.message,
    tier: getTier(n.type),
    action_url: n.actionUrl || null,
    metadata: n.metadata || {},
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    console.error("createBulkNotifications error:", error);
    return { success: false, count: 0, error: error.message };
  }

  return { success: true, count: notifications.length };
}

// ========================
// Tier mapping — maps notification types to urgency tiers
// ========================
function getTier(type: NotificationType): "urgent" | "important" | "informational" {
  switch (type) {
    case "session_reminder":
    case "roster_assigned":
    case "roster_changed":
      return "urgent";
    case "booking_confirmed":
    case "payment_received":
    case "invoice_ready":
    case "child_update":
      return "important";
    case "session_completed":
    case "general":
    default:
      return "informational";
  }
}
