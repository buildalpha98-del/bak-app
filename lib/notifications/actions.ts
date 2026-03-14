"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types/database";
import type { NotificationChannel } from "@/lib/types/enums";

// ============================================================
// Notification server actions
// ============================================================

export async function getRecentNotifications(
  limit: number = 20
): Promise<{ data: Notification[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data: data as Notification[], error: null };
  } catch (err) {
    console.error("getRecentNotifications error:", err);
    return { data: null, error: "Failed to fetch notifications." };
  }
}

export async function getUnreadCount(): Promise<{
  data: number;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: 0, error: "Not authenticated." };

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) throw error;
    return { data: count ?? 0, error: null };
  } catch (err) {
    console.error("getUnreadCount error:", err);
    return { data: 0, error: "Failed to fetch unread count." };
  }
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("markNotificationRead error:", err);
    return { error: "Failed to mark as read." };
  }
}

export async function markAllNotificationsRead(): Promise<{
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    return { error: "Failed to mark all as read." };
  }
}

export async function getNotificationPreferences(): Promise<{
  data: { notification_type: string; channel: NotificationChannel }[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("notification_type, channel")
      .eq("user_id", user.id);

    if (error) throw error;
    return {
      data: data as { notification_type: string; channel: NotificationChannel }[],
      error: null,
    };
  } catch (err) {
    console.error("getNotificationPreferences error:", err);
    return { data: null, error: "Failed to fetch preferences." };
  }
}

export async function updateNotificationPreference(
  notificationType: string,
  channel: NotificationChannel
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        notification_type: notificationType,
        channel,
      },
      { onConflict: "user_id,notification_type" }
    );

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("updateNotificationPreference error:", err);
    return { error: "Failed to update preference." };
  }
}
