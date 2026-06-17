"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification } from "@/lib/notifications/send";
import type { AnnouncementAudience } from "@/lib/types/enums";
import type { NotificationEvent } from "@/lib/notifications/events";

// ============================================================
// Enriched announcement type returned by queries
// ============================================================

export interface EnrichedAnnouncement {
  id: string;
  title: string;
  body: string;
  attachments: string[] | null;
  audience: AnnouncementAudience;
  created_by: string;
  created_at: string;
  author_name: string;
  read_count: number;
  audience_count: number;
  is_read: boolean;
}

export interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  attachments: string[] | null;
  audience: AnnouncementAudience;
  created_by: string;
  created_at: string;
  author_name: string;
  read_receipts?: Array<{ user_name: string; read_at: string }>;
}

// ============================================================
// getAnnouncements — paginated list with read status
// ============================================================

export async function getAnnouncements(
  page = 1
): Promise<{ data: EnrichedAnnouncement[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const limit = 20;
  const offset = (page - 1) * limit;

  // Fetch announcements with author name
  const { data: announcements, error } = await supabase
    .from("announcements")
    .select("*, profiles!announcements_created_by_fkey(name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { data: null, error: error.message };
  if (!announcements || announcements.length === 0) return { data: [], error: null };

  // Build enriched list
  const enriched: EnrichedAnnouncement[] = [];

  for (const ann of announcements) {
    // Read count for this announcement
    const { count: readCount } = await supabase
      .from("announcement_reads")
      .select("*", { count: "exact", head: true })
      .eq("announcement_id", ann.id);

    // Audience count based on audience type
    let audienceQuery = supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if (ann.audience === "coaches_only") {
      audienceQuery = audienceQuery.eq("role", "coach");
    } else if (ann.audience === "ops_and_coaches") {
      audienceQuery = audienceQuery.in("role", ["ops", "coach"]);
    }
    // 'all' = all active profiles, no role filter

    const { count: audienceCount } = await audienceQuery;

    // Check if current user has read this announcement
    const { data: readRecord } = await supabase
      .from("announcement_reads")
      .select("id")
      .eq("announcement_id", ann.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const profile = ann.profiles as unknown as { name: string } | null;

    enriched.push({
      id: ann.id,
      title: ann.title,
      body: ann.body,
      attachments: ann.attachments,
      audience: ann.audience,
      created_by: ann.created_by,
      created_at: ann.created_at,
      author_name: profile?.name ?? "Unknown",
      read_count: readCount ?? 0,
      audience_count: audienceCount ?? 0,
      is_read: !!readRecord,
    });
  }

  return { data: enriched, error: null };
}

// ============================================================
// getAnnouncementDetail — single announcement with receipts
// ============================================================

export async function getAnnouncementDetail(
  announcementId: string
): Promise<{ data: AnnouncementDetail | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Get user role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  // Fetch announcement with author
  const { data: announcement, error } = await supabase
    .from("announcements")
    .select("*, profiles!announcements_created_by_fkey(name)")
    .eq("id", announcementId)
    .single();

  if (error || !announcement) {
    return { data: null, error: error?.message ?? "Announcement not found" };
  }

  const authorProfile = announcement.profiles as unknown as { name: string } | null;

  const detail: AnnouncementDetail = {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    attachments: announcement.attachments,
    audience: announcement.audience,
    created_by: announcement.created_by,
    created_at: announcement.created_at,
    author_name: authorProfile?.name ?? "Unknown",
  };

  // Admin/ops: fetch read receipts
  if (role === "admin" || role === "ops") {
    const { data: reads } = await supabase
      .from("announcement_reads")
      .select("read_at, profiles!announcement_reads_user_id_fkey(name)")
      .eq("announcement_id", announcementId)
      .order("read_at", { ascending: true });

    if (reads) {
      detail.read_receipts = reads.map((r) => {
        const rProfile = r.profiles as unknown as { name: string } | null;
        return {
          user_name: rProfile?.name ?? "Unknown",
          read_at: r.read_at,
        };
      });
    }
  }

  // Coach: auto-mark as read
  if (role === "coach") {
    await markAnnouncementRead(announcementId);
  }

  return { data: detail, error: null };
}

// ============================================================
// createAnnouncement — publish and notify
// ============================================================

export async function createAnnouncement(data: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Verify role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { data: null, error: "Insufficient permissions" };
  }

  // Validate
  if (!data.title || data.title.length > 200) {
    return { data: null, error: "Title is required and must be 200 characters or fewer" };
  }
  if (!data.body || data.body.length > 10000) {
    return { data: null, error: "Body is required and must be 10,000 characters or fewer" };
  }

  // Insert announcement
  const { data: announcement, error } = await supabase
    .from("announcements")
    .insert({
      title: data.title,
      body: data.body,
      audience: data.audience,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !announcement) {
    return { data: null, error: error?.message ?? "Failed to create announcement" };
  }

  // Determine recipients
  let recipientsQuery = supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("status", "active")
    .neq("id", user.id);

  if (data.audience === "coaches_only") {
    recipientsQuery = recipientsQuery.eq("role", "coach");
  } else if (data.audience === "ops_and_coaches") {
    recipientsQuery = recipientsQuery.in("role", ["ops", "coach"]);
  }

  const { data: recipients } = await recipientsQuery;

  // Send notifications
  if (recipients && recipients.length > 0) {
    const event: NotificationEvent = {
      type: "announcement_posted",
      title: `New Announcement: ${data.title}`,
      body: data.body.substring(0, 100),
      entityType: "announcement",
      entityId: announcement.id,
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
  }

  return { data: { id: announcement.id }, error: null };
}

// ============================================================
// deleteAnnouncement — hard delete with read receipts
// ============================================================

export async function deleteAnnouncement(
  announcementId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { error: "Insufficient permissions" };
  }

  // Delete read receipts first
  await supabase
    .from("announcement_reads")
    .delete()
    .eq("announcement_id", announcementId);

  // Delete the announcement
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId);

  if (error) return { error: error.message };

  return { error: null };
}

// ============================================================
// bulkDeleteAnnouncements — admin/ops bulk cleanup
// ============================================================
//
// Schema doesn't track archive state, so the "archive" action in the
// admin UI maps to a hard delete (read receipts cascade). Partial
// failure: per-id error so the caller can toast progress.

export interface BulkAnnouncementResult {
  succeeded: number;
  failed: Array<{ id: string; error: string }>;
}

export async function bulkDeleteAnnouncements(
  ids: string[]
): Promise<{ data: BulkAnnouncementResult | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { data: null, error: "Insufficient permissions" };
  }

  if (ids.length === 0) {
    return { data: { succeeded: 0, failed: [] }, error: null };
  }

  const failed: Array<{ id: string; error: string }> = [];
  let succeeded = 0;

  for (const id of ids) {
    // Read receipts first (FK ON DELETE CASCADE would handle this
    // automatically — explicit delete is defensive in case the
    // cascade is dropped in the future).
    await supabase
      .from("announcement_reads")
      .delete()
      .eq("announcement_id", id);
    const { error: delErr } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id);
    if (delErr) {
      failed.push({ id, error: delErr.message });
    } else {
      succeeded += 1;
    }
  }

  return { data: { succeeded, failed }, error: null };
}

// ============================================================
// markAnnouncementRead — upsert read receipt
// ============================================================

export async function markAnnouncementRead(
  announcementId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("announcement_reads").upsert(
    {
      announcement_id: announcementId,
      user_id: user.id,
    },
    { onConflict: "announcement_id,user_id", ignoreDuplicates: true }
  );

  if (error) return { error: error.message };
  return { error: null };
}
