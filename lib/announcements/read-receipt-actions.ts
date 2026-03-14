"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification } from "@/lib/notifications/send";
import type { NotificationEvent } from "@/lib/notifications/events";

// ============================================================
// Read receipt types
// ============================================================

export interface ReadReceiptEntry {
  userId: string;
  name: string;
  role: string;
  hasRead: boolean;
  readAt: string | null;
}

// ============================================================
// getAnnouncementReadReceipts
// ============================================================

export async function getAnnouncementReadReceipts(
  announcementId: string
): Promise<{ data: ReadReceiptEntry[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };

    // Get the announcement's audience
    const { data: announcement, error: annError } = await supabase
      .from("announcements")
      .select("audience")
      .eq("id", announcementId)
      .single();

    if (annError || !announcement) {
      return { data: null, error: annError?.message ?? "Announcement not found" };
    }

    // Query all active staff, filtered by audience
    let staffQuery = supabase
      .from("profiles")
      .select("id, name, role")
      .eq("status", "active");

    if (announcement.audience === "coaches_only") {
      staffQuery = staffQuery.eq("role", "coach");
    } else if (announcement.audience === "ops_and_coaches") {
      staffQuery = staffQuery.in("role", ["ops", "coach"]);
    }
    // "all" = all active staff, no role filter

    const { data: staff, error: staffError } = await staffQuery.order("name");
    if (staffError) return { data: null, error: staffError.message };
    if (!staff || staff.length === 0) return { data: [], error: null };

    // Query read receipts for this announcement
    const { data: reads, error: readsError } = await supabase
      .from("announcement_reads")
      .select("user_id, read_at")
      .eq("announcement_id", announcementId);

    if (readsError) return { data: null, error: readsError.message };

    // Build a lookup of read receipts by user_id
    const readMap = new Map<string, string>();
    if (reads) {
      for (const r of reads) {
        readMap.set(r.user_id, r.read_at);
      }
    }

    // Combine staff with read status
    const entries: ReadReceiptEntry[] = staff.map((s) => ({
      userId: s.id,
      name: s.name,
      role: s.role,
      hasRead: readMap.has(s.id),
      readAt: readMap.get(s.id) ?? null,
    }));

    return { data: entries, error: null };
  } catch (err) {
    console.error("getAnnouncementReadReceipts error:", err);
    return { data: null, error: "Failed to fetch read receipts." };
  }
}

// ============================================================
// nudgeUnreadUsers — send reminder notifications
// ============================================================

export async function nudgeUnreadUsers(
  announcementId: string,
  userIds: string[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (userIds.length === 0) return { error: null };

    // Get announcement title
    const { data: announcement, error: annError } = await supabase
      .from("announcements")
      .select("title")
      .eq("id", announcementId)
      .single();

    if (annError || !announcement) {
      return { error: annError?.message ?? "Announcement not found" };
    }

    // Get user details for recipients
    const { data: recipients, error: recipError } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .in("id", userIds);

    if (recipError || !recipients) {
      return { error: recipError?.message ?? "Failed to fetch recipients" };
    }

    const event: NotificationEvent = {
      type: "announcement_posted",
      title: `Reminder: ${announcement.title}`,
      body: "You have an unread announcement. Please review it.",
      entityType: "announcement",
      entityId: announcementId,
    };

    await triggerNotification(
      event,
      recipients.map((r) => ({
        userId: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
      }))
    );

    return { error: null };
  } catch (err) {
    console.error("nudgeUnreadUsers error:", err);
    return { error: "Failed to send nudge notifications." };
  }
}
