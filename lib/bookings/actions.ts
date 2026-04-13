"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookableSession, WaitlistEntry } from "@/lib/types/database";
import type { BookableSessionType, BookableSessionStatus } from "@/lib/types/enums";
import { sendEmail } from "@/lib/launch/email";

// ============================================================
// Types
// ============================================================

export interface BookableSessionInput {
  session_id?: string | null;
  title: string;
  description?: string | null;
  session_type: BookableSessionType;
  date: string;
  start_time: string;
  end_time: string;
  location_name?: string | null;
  location_address: string;
  suburb: string;
  sport?: string | null;
  age_group_min?: number | null;
  age_group_max?: number | null;
  max_capacity: number;
  price_cents: number;
  package_eligible?: boolean;
  coach_id?: string | null;
  status?: BookableSessionStatus;
  booking_opens_at?: string | null;
  booking_closes_at?: string | null;
}

export interface BulkCreateInput {
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  title: string;
  description?: string | null;
  session_type: BookableSessionType;
  location_name?: string | null;
  location_address: string;
  suburb: string;
  sport?: string | null;
  age_group_min?: number | null;
  age_group_max?: number | null;
  max_capacity: number;
  price_cents: number;
  package_eligible?: boolean;
  coach_id?: string | null;
  status?: BookableSessionStatus;
  exclude_weekends?: boolean;
}

export interface BookableSessionFilters {
  session_type?: BookableSessionType;
  status?: BookableSessionStatus;
  suburb?: string;
  sport?: string;
  date_from?: string;
  date_to?: string;
}

// ============================================================
// Get bookable sessions (admin/ops)
// ============================================================

export async function getBookableSessions(
  filters?: BookableSessionFilters
): Promise<{ data: BookableSession[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("bookable_sessions")
      .select("*")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (filters?.session_type) {
      query = query.eq("session_type", filters.session_type);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.suburb) {
      query = query.eq("suburb", filters.suburb);
    }
    if (filters?.sport) {
      query = query.eq("sport", filters.sport);
    }
    if (filters?.date_from) {
      query = query.gte("date", filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte("date", filters.date_to);
    }

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getBookableSessions error:", err);
    return { data: [], error: "Failed to load sessions." };
  }
}

// ============================================================
// Get open bookable sessions (parent-facing)
// ============================================================

export async function getOpenBookableSessions(
  suburb?: string,
  sport?: string
): Promise<{ data: BookableSession[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("bookable_sessions")
      .select("*")
      .eq("status", "open")
      .gte("date", new Date().toISOString().split("T")[0])
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (suburb) query = query.eq("suburb", suburb);
    if (sport) query = query.eq("sport", sport);

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getOpenBookableSessions error:", err);
    return { data: [], error: "Failed to load sessions." };
  }
}

// ============================================================
// Get single bookable session
// ============================================================

export async function getBookableSession(
  id: string
): Promise<{ data: BookableSession | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("bookable_sessions")
      .select("*, profiles:coach_id(name)")
      .eq("id", id)
      .single();

    if (error) return { data: null, error: error.message };

    // Flatten coach name
    const coach_name = (data as any)?.profiles?.name ?? null;
    const { profiles: _, ...rest } = data as any;
    return { data: { ...rest, coach_name } as any, error: null };
  } catch (err) {
    console.error("getBookableSession error:", err);
    return { data: null, error: "Failed to load session." };
  }
}

// ============================================================
// Create bookable session
// ============================================================

export async function createBookableSession(
  input: BookableSessionInput
): Promise<{ data: BookableSession | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    // Default booking_closes_at to 2 hours before session start if not set
    let closesAt = input.booking_closes_at;
    if (!closesAt && input.date && input.start_time) {
      const sessionStart = new Date(`${input.date}T${input.start_time}`);
      sessionStart.setHours(sessionStart.getHours() - 2);
      closesAt = sessionStart.toISOString();
    }

    const { data, error } = await supabase
      .from("bookable_sessions")
      .insert({
        ...input,
        booking_closes_at: closesAt,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("createBookableSession error:", err);
    return { data: null, error: "Failed to create session." };
  }
}

// ============================================================
// Update bookable session
// ============================================================

export async function updateBookableSession(
  id: string,
  updates: Partial<BookableSessionInput>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("bookable_sessions")
      .update(updates)
      .eq("id", id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updateBookableSession error:", err);
    return { error: "Failed to update session." };
  }
}

// ============================================================
// Bulk create bookable sessions (holiday clinic series)
// ============================================================

export async function bulkCreateBookableSessions(
  input: BulkCreateInput
): Promise<{ data: BookableSession[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: [], error: "Not authenticated." };

    const sessions: Omit<BookableSessionInput, "status">[] = [];
    const start = new Date(input.start_date);
    const end = new Date(input.end_date);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (input.exclude_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        continue;
      }

      const dateStr = d.toISOString().split("T")[0];

      // Default booking_closes_at to 2 hours before session start
      const sessionStart = new Date(`${dateStr}T${input.start_time}`);
      sessionStart.setHours(sessionStart.getHours() - 2);

      sessions.push({
        title: input.title,
        description: input.description,
        session_type: input.session_type,
        date: dateStr,
        start_time: input.start_time,
        end_time: input.end_time,
        location_name: input.location_name,
        location_address: input.location_address,
        suburb: input.suburb,
        sport: input.sport,
        age_group_min: input.age_group_min,
        age_group_max: input.age_group_max,
        max_capacity: input.max_capacity,
        price_cents: input.price_cents,
        package_eligible: input.package_eligible ?? true,
        coach_id: input.coach_id,
        booking_closes_at: sessionStart.toISOString(),
      });
    }

    if (sessions.length === 0) {
      return { data: [], error: "No sessions to create for the given date range." };
    }

    const { data, error } = await supabase
      .from("bookable_sessions")
      .insert(
        sessions.map((s) => ({
          ...s,
          status: input.status ?? ("draft" as const),
          created_by: user.id,
        }))
      )
      .select();

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("bulkCreateBookableSessions error:", err);
    return { data: [], error: "Failed to create sessions." };
  }
}

// ============================================================
// Waitlist: join
// ============================================================

export async function joinWaitlist(
  bookableSessionId: string,
  childId: string
): Promise<{ data: WaitlistEntry | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { data: null, error: "No parent profile." };

    // Check if already on waitlist
    const { data: existing } = await supabase
      .from("waitlist")
      .select("id")
      .eq("bookable_session_id", bookableSessionId)
      .eq("parent_id", parentProfile.id)
      .eq("child_id", childId)
      .in("status", ["waiting", "offered"])
      .single();

    if (existing) return { data: null, error: "Already on the waitlist for this session." };

    // Get next position
    const { count } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true })
      .eq("bookable_session_id", bookableSessionId)
      .in("status", ["waiting", "offered"]);

    const position = (count ?? 0) + 1;

    const { data, error } = await supabase
      .from("waitlist")
      .insert({
        bookable_session_id: bookableSessionId,
        parent_id: parentProfile.id,
        child_id: childId,
        position,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("joinWaitlist error:", err);
    return { data: null, error: "Failed to join waitlist." };
  }
}

// ============================================================
// Waitlist: cancel
// ============================================================

export async function cancelWaitlistEntry(
  waitlistId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("waitlist")
      .update({ status: "cancelled" })
      .eq("id", waitlistId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("cancelWaitlistEntry error:", err);
    return { error: "Failed to cancel waitlist entry." };
  }
}

// ============================================================
// Waitlist: get parent's entries
// ============================================================

export async function getParentWaitlistEntries(): Promise<{
  data: (WaitlistEntry & { session: BookableSession })[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: [], error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { data: [], error: "No parent profile." };

    const { data, error } = await supabase
      .from("waitlist")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .in("status", ["waiting", "offered"])
      .order("created_at", { ascending: true });

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((w) => ({
      ...w,
      session: (w as Record<string, unknown>).bookable_sessions as unknown as BookableSession,
      bookable_sessions: undefined,
    })) as (WaitlistEntry & { session: BookableSession })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getParentWaitlistEntries error:", err);
    return { data: [], error: "Failed to load waitlist." };
  }
}

// ============================================================
// Waitlist: process spot opening (called when booking cancelled)
// ============================================================

export async function processWaitlistForSession(
  bookableSessionId: string
): Promise<{ offered: boolean; error: string | null }> {
  try {
    const adminClient = createSupabaseAdmin();

    // Find first waiting entry
    const { data: nextEntry } = await adminClient
      .from("waitlist")
      .select("*, parent_profiles!inner(user_id, first_name, email)")
      .eq("bookable_session_id", bookableSessionId)
      .eq("status", "waiting")
      .order("position", { ascending: true })
      .limit(1)
      .single();

    if (!nextEntry) return { offered: false, error: null };

    // Set offer with 24-hour expiry
    const offerExpiresAt = new Date();
    offerExpiresAt.setHours(offerExpiresAt.getHours() + 24);

    const { error: updateError } = await adminClient
      .from("waitlist")
      .update({
        status: "offered",
        offered_at: new Date().toISOString(),
        offer_expires_at: offerExpiresAt.toISOString(),
      })
      .eq("id", nextEntry.id);

    if (updateError) return { offered: false, error: updateError.message };

    // Send notification (import would be circular, so we use the admin client directly)
    const parent = nextEntry.parent_profiles as { user_id: string; first_name: string; email: string };

    // Get session details for notification
    const { data: session } = await adminClient
      .from("bookable_sessions")
      .select("title, date")
      .eq("id", bookableSessionId)
      .single();

    if (parent && session) {
      const formattedDate = new Date(session.date).toLocaleDateString("en-AU");

      await adminClient.from("notifications").insert({
        user_id: parent.user_id,
        type: "waitlist_offer",
        title: "A spot has opened!",
        body: `A spot has opened for ${session.title} on ${formattedDate}. You have 24 hours to confirm.`,
        tier: "urgent",
        entity_type: "waitlist",
        entity_id: nextEntry.id,
        action_url: "/parent/bookings",
        metadata: { bookable_session_id: bookableSessionId },
      });

      // Send waitlist offer email (fire-and-forget)
      if (parent.email) {
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.buildalphakids.com.au";
        void sendEmail({
          to: parent.email,
          subject: `A spot has opened — ${session.title}`,
          html: `<p>Hi ${parent.first_name},</p><p>Great news! A spot has opened for <strong>${session.title}</strong> on <strong>${formattedDate}</strong>.</p><p>You have <strong>24 hours</strong> to confirm your booking before the spot is offered to the next person on the waitlist.</p><p><a href="${APP_URL}/parent/bookings" style="display:inline-block;padding:12px 24px;background:#E8712A;color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;">Confirm Booking</a></p>`,
          recipientId: parent.user_id,
          emailType: "waitlist_offer",
          metadata: { waitlist_id: nextEntry.id, bookable_session_id: bookableSessionId },
        }).catch(console.error);
      }
    }

    return { offered: true, error: null };
  } catch (err) {
    console.error("processWaitlistForSession error:", err);
    return { offered: false, error: "Failed to process waitlist." };
  }
}

// ============================================================
// Get waitlist for a session (admin view)
// ============================================================

export async function getSessionWaitlist(
  bookableSessionId: string
): Promise<{ data: WaitlistEntry[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("waitlist")
      .select("*, children:child_id(first_name, last_name), parent_profiles:parent_id(first_name, last_name)")
      .eq("bookable_session_id", bookableSessionId)
      .order("position", { ascending: true });

    if (error) return { data: [], error: error.message };

    // Flatten names
    const enriched = (data ?? []).map((entry: any) => ({
      ...entry,
      child_name: entry.children
        ? `${entry.children.first_name} ${entry.children.last_name}`
        : null,
      parent_name: entry.parent_profiles
        ? `${entry.parent_profiles.first_name} ${entry.parent_profiles.last_name}`
        : null,
    }));
    return { data: enriched as any, error: null };
  } catch (err) {
    console.error("getSessionWaitlist error:", err);
    return { data: [], error: "Failed to load waitlist." };
  }
}

// ============================================================
// Get coaches for dropdown
// ============================================================

export async function getCoachesForDropdown(): Promise<{
  data: { id: string; name: string }[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .order("name");

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getCoachesForDropdown error:", err);
    return { data: [], error: "Failed to load coaches." };
  }
}
