"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";
import type { DirectMessage } from "@/lib/types/database";
import type { UserRole } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface ConversationSummary {
  partner_id: string;
  partner_name: string;
  partner_role: UserRole;
  last_message: string;
  last_message_at: string;
  last_message_sender_id: string;
  unread_count: number;
}

export interface ContactForMessaging {
  id: string;
  full_name: string;
  role: UserRole;
}

// ============================================================
// getConversations
// ============================================================

export async function getConversations(): Promise<ConversationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createSupabaseAdmin();

  // 1. Fetch all DMs involving the current user
  const { data: messages, error } = await admin
    .from("direct_messages")
    .select("id, sender_id, recipient_id, content, created_at, deleted_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!messages || messages.length === 0) return [];

  // 2. Group by partner, take most recent message per partner
  const partnerMap = new Map<
    string,
    {
      last_message: DirectMessage;
      unread_count: number;
    }
  >();

  for (const msg of messages) {
    const partnerId =
      msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;

    if (!partnerMap.has(partnerId)) {
      partnerMap.set(partnerId, {
        last_message: msg as DirectMessage,
        unread_count: 0,
      });
    }

    // Count unread: messages FROM partner TO me that are unread and not deleted
    if (
      msg.sender_id === partnerId &&
      msg.recipient_id === user.id &&
      !msg.deleted_at
    ) {
      // We need to check read_at separately since we didn't select it above
      // Instead, count after
    }
  }

  // 3. Count unread per partner
  const partnerIds = Array.from(partnerMap.keys());

  for (const partnerId of partnerIds) {
    const { count } = await admin
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", partnerId)
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .is("deleted_at", null);

    const entry = partnerMap.get(partnerId);
    if (entry) {
      entry.unread_count = count ?? 0;
    }
  }

  // 4. Fetch partner profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, role")
    .in("id", partnerIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, { name: p.name, role: p.role }])
  );

  // 5. Build result sorted by last message time DESC
  const conversations: ConversationSummary[] = partnerIds
    .map((partnerId) => {
      const entry = partnerMap.get(partnerId)!;
      const profile = profileMap.get(partnerId);
      const msg = entry.last_message;

      return {
        partner_id: partnerId,
        partner_name: profile?.name ?? "Unknown",
        partner_role: (profile?.role ?? "coach") as UserRole,
        last_message: msg.deleted_at
          ? "Message deleted"
          : msg.content ?? "Message deleted",
        last_message_at: msg.created_at,
        last_message_sender_id: msg.sender_id,
        unread_count: entry.unread_count,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
    );

  return conversations;
}

// ============================================================
// getConversationMessages
// ============================================================

export async function getConversationMessages(
  otherUserId: string,
  before?: string
): Promise<{ data: DirectMessage[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createSupabaseAdmin();

  let query = admin
    .from("direct_messages")
    .select("*")
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`
    )
    .order("created_at", { ascending: true })
    .limit(50);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: messages, error } = await query;

  if (error) throw new Error(error.message);

  // Side effect: mark messages from otherUser as read
  await admin
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", otherUserId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  return {
    data: (messages ?? []) as DirectMessage[],
    hasMore: (messages?.length ?? 0) === 50,
  };
}

// ============================================================
// sendDirectMessage
// ============================================================

export async function sendDirectMessage(
  recipientId: string,
  content: string
): Promise<DirectMessage> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = content.trim();
  if (!trimmed) throw new Error("Message content is required");
  if (trimmed.length > 2000)
    throw new Error("Message must be 2000 characters or fewer");

  const admin = createSupabaseAdmin();

  // Get sender name for the notification
  const { data: senderProfile } = await admin
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .single();

  const { data: message, error } = await admin
    .from("direct_messages")
    .insert({
      sender_id: user.id,
      recipient_id: recipientId,
      content: trimmed,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Get recipient details for notification
  const { data: recipientProfile } = await admin
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", recipientId)
    .single();

  if (recipientProfile) {
    try {
      await triggerNotification(
        {
          type: "dm_received",
          title: `New message from ${senderProfile?.name ?? "Someone"}`,
          body: trimmed.substring(0, 100),
          entityType: "direct_message",
          entityId: user.id,
        },
        [
          {
            userId: recipientProfile.id,
            email: recipientProfile.email,
            name: recipientProfile.name,
            role: recipientProfile.role,
          },
        ]
      );
    } catch (err) {
      console.error("Failed to send DM notification:", err);
    }
  }

  return message as DirectMessage;
}

// ============================================================
// editDirectMessage
// ============================================================

export async function editDirectMessage(
  messageId: string,
  newContent: string
): Promise<DirectMessage> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = newContent.trim();
  if (!trimmed) throw new Error("Message content is required");
  if (trimmed.length > 2000)
    throw new Error("Message must be 2000 characters or fewer");

  const admin = createSupabaseAdmin();

  // Verify ownership and not deleted
  const { data: existing, error: fetchError } = await admin
    .from("direct_messages")
    .select("*")
    .eq("id", messageId)
    .single();

  if (fetchError || !existing) throw new Error("Message not found");
  if (existing.sender_id !== user.id) throw new Error("Not authorised");
  if (existing.deleted_at) throw new Error("Cannot edit a deleted message");

  const { data: updated, error } = await admin
    .from("direct_messages")
    .update({
      content: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return updated as DirectMessage;
}

// ============================================================
// deleteDirectMessage
// ============================================================

export async function deleteDirectMessage(messageId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createSupabaseAdmin();

  // Verify ownership and not already deleted
  const { data: existing, error: fetchError } = await admin
    .from("direct_messages")
    .select("sender_id, deleted_at")
    .eq("id", messageId)
    .single();

  if (fetchError || !existing) throw new Error("Message not found");
  if (existing.sender_id !== user.id) throw new Error("Not authorised");
  if (existing.deleted_at) throw new Error("Message already deleted");

  const { error } = await admin
    .from("direct_messages")
    .update({
      content: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw new Error(error.message);
}

// ============================================================
// getContactsForMessaging
// ============================================================

export async function getContactsForMessaging(): Promise<
  ContactForMessaging[]
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createSupabaseAdmin();

  // Get current user's role
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");

  let query = admin
    .from("profiles")
    .select("id, name, role")
    .eq("status", "active")
    .neq("id", user.id)
    .order("name");

  if (profile.role === "admin" || profile.role === "ops") {
    // Admin/ops can message coaches
    query = query.eq("role", "coach");
  } else {
    // Coaches can message admin and ops
    query = query.in("role", ["admin", "ops"]);
  }

  const { data: contacts, error } = await query;

  if (error) throw new Error(error.message);

  return (contacts ?? []).map((c) => ({
    id: c.id,
    full_name: c.name,
    role: c.role as UserRole,
  }));
}

// ============================================================
// getUnreadDMCount
// ============================================================

export async function getUnreadDMCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const admin = createSupabaseAdmin();

  const { count, error } = await admin
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) return 0;

  return count ?? 0;
}
