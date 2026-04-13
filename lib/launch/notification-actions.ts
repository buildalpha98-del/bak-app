"use server";

// ============================================================
// Launch Foundation — Notification actions
// Wraps existing notification actions + adds extended query support
// ============================================================

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  tier: string;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  action_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ========================
// 1. getNotifications — paginated with unread count
// ========================

export async function getNotifications(
  userId: string,
  params?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }
): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
  total: number;
}> {
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  const unreadOnly = params?.unreadOnly ?? false;

  const supabase = await createSupabaseServerClient();

  // Build the main query
  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getNotifications error:", error);
    return { notifications: [], unreadCount: 0, total: 0 };
  }

  // Get unread count separately if not already filtering by unread
  let unreadCount = 0;
  if (unreadOnly) {
    unreadCount = count ?? 0;
  } else {
    const { count: uc } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    unreadCount = uc ?? 0;
  }

  return {
    notifications: (data ?? []) as NotificationItem[],
    unreadCount,
    total: count ?? 0,
  };
}

// ========================
// 2. markAsRead
// ========================

export async function markAsRead(
  notificationId: string
): Promise<{ success: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  return { success: !error };
}

// ========================
// 3. markAllAsRead
// ========================

export async function markAllAsRead(
  userId: string
): Promise<{ success: boolean; count: number }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false)
    .select("id");

  if (error) {
    console.error("markAllAsRead error:", error);
    return { success: false, count: 0 };
  }

  return { success: true, count: data?.length ?? 0 };
}
