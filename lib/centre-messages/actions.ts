"use server";

// ============================================================
// Centre messages — staff-side inbox actions
// ============================================================
//
// The client portal writes to `centre_messages`; these actions give
// admin/ops a unified inbox over every centre thread. RLS
// (centre_messages_staff_read / _staff_insert / _update_read) already
// authorises staff, so everything runs on the cookie server client.
//
// Unread = client-sent messages with read_at IS NULL. Opening a
// thread marks them read.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CentreThreadSummary {
  centre_id: string;
  centre_name: string;
  last_message: string;
  last_sender: "client" | "staff";
  last_at: string;
  unread_count: number;
}

export interface CentreThreadMessage {
  id: string;
  sender_type: "client" | "staff";
  content: string;
  created_at: string;
}

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { supabase, user: null, error: "Not authorised." };
  }
  return { supabase, user, error: null };
}

export async function getCentreMessageThreads(): Promise<{
  data: CentreThreadSummary[];
  error: string | null;
}> {
  try {
    const { supabase, user, error: authError } = await requireStaff();
    if (authError || !user) return { data: [], error: authError };

    // Recent window is plenty for an inbox list; the thread view loads
    // a centre's full history separately.
    const { data: messages, error } = await supabase
      .from("centre_messages")
      .select("centre_id, content, sender_type, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) return { data: [], error: error.message };
    if (!messages || messages.length === 0) return { data: [], error: null };

    const byCentre = new Map<
      string,
      { last: (typeof messages)[number]; unread: number }
    >();
    for (const m of messages) {
      const entry = byCentre.get(m.centre_id);
      const isUnreadClient = m.sender_type === "client" && !m.read_at;
      if (!entry) {
        byCentre.set(m.centre_id, {
          last: m,
          unread: isUnreadClient ? 1 : 0,
        });
      } else if (isUnreadClient) {
        entry.unread++;
      }
    }

    const centreIds = [...byCentre.keys()];
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name")
      .in("id", centreIds);
    const nameById = new Map((centres ?? []).map((c) => [c.id, c.name]));

    const threads: CentreThreadSummary[] = centreIds.map((id) => {
      const { last, unread } = byCentre.get(id)!;
      return {
        centre_id: id,
        centre_name: nameById.get(id) ?? "Unknown centre",
        last_message: last.content,
        last_sender: last.sender_type as "client" | "staff",
        last_at: last.created_at,
        unread_count: unread,
      };
    });

    threads.sort((a, b) => b.last_at.localeCompare(a.last_at));
    return { data: threads, error: null };
  } catch (err) {
    console.error("getCentreMessageThreads error:", err);
    return { data: [], error: "Failed to load centre messages." };
  }
}

/**
 * Full thread for one centre. Marks unread client messages as read —
 * opening the thread IS the read action, mirroring direct messages.
 */
export async function getCentreThread(centreId: string): Promise<{
  data: { centreName: string; messages: CentreThreadMessage[] } | null;
  error: string | null;
}> {
  try {
    const { supabase, user, error: authError } = await requireStaff();
    if (authError || !user) return { data: null, error: authError };

    const [{ data: centre }, { data: messages, error }] = await Promise.all([
      supabase.from("centres").select("name").eq("id", centreId).single(),
      supabase
        .from("centre_messages")
        .select("id, sender_type, content, created_at, read_at")
        .eq("centre_id", centreId)
        .order("created_at", { ascending: true }),
    ]);

    if (error) return { data: null, error: error.message };

    const hasUnread = (messages ?? []).some(
      (m) => m.sender_type === "client" && !m.read_at
    );
    if (hasUnread) {
      await supabase
        .from("centre_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("centre_id", centreId)
        .eq("sender_type", "client")
        .is("read_at", null);
    }

    return {
      data: {
        centreName: centre?.name ?? "Unknown centre",
        messages: (messages ?? []).map((m) => ({
          id: m.id,
          sender_type: m.sender_type as "client" | "staff",
          content: m.content,
          created_at: m.created_at,
        })),
      },
      error: null,
    };
  } catch (err) {
    console.error("getCentreThread error:", err);
    return { data: null, error: "Failed to load thread." };
  }
}

export async function sendStaffCentreMessage(
  centreId: string,
  content: string
): Promise<{ error: string | null }> {
  try {
    const { supabase, user, error: authError } = await requireStaff();
    if (authError || !user) return { error: authError };

    const trimmed = content.trim();
    if (!trimmed) return { error: "Message cannot be empty." };
    if (trimmed.length > 2000) return { error: "Message is too long." };

    const { error } = await supabase.from("centre_messages").insert({
      centre_id: centreId,
      sender_type: "staff",
      sender_staff_id: user.id,
      content: trimmed,
    });

    if (error) return { error: error.message };

    revalidatePath("/admin/centre-messages");
    revalidatePath("/ops/centre-messages");
    return { error: null };
  } catch (err) {
    console.error("sendStaffCentreMessage error:", err);
    return { error: "Failed to send message." };
  }
}

/** Unread client-message count across all centres (nav badge / pulse). */
export async function getCentreMessagesUnreadCount(): Promise<number> {
  try {
    const { supabase, user, error } = await requireStaff();
    if (error || !user) return 0;

    const { count } = await supabase
      .from("centre_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_type", "client")
      .is("read_at", null);

    return count ?? 0;
  } catch {
    return 0;
  }
}
