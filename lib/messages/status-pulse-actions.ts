"use server";

// ============================================================
// Messages dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N unread · M awaiting response · K sent today
// · F mentions" strip above /admin/messages.
//
// Implementation notes:
//   - Unread: direct_messages where recipient_id = me, read_at is
//     null, deleted_at is null.
//   - Awaiting response: direct_messages I sent where the
//     conversation partner hasn't sent anything back since my last
//     message. Approximated by: messages I sent in last 7d where
//     the latest message in the conversation is from me.
//   - Sent today: direct_messages I sent today.
//   - Mentions: not modelled in DM table — count is always 0 today,
//     reserved for future @-mention notifications.
//   - Errors swallow to zeros.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export interface MessagesStatusPulse {
  unreadCount: number;
  awaitingResponseCount: number;
  sentTodayCount: number;
  mentionsCount: number;
}

export async function getMessagesStatusPulse(): Promise<MessagesStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        unreadCount: 0,
        awaitingResponseCount: 0,
        sentTodayCount: 0,
        mentionsCount: 0,
      };
    }

    const admin = createSupabaseAdmin();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartIso = todayStart.toISOString();

    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [unreadRes, sentTodayRes, recentMineRes] = await Promise.all([
      admin
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null),
      admin
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", user.id)
        .gte("created_at", todayStartIso),
      // Pull last 7d of my outbound messages so we can compute
      // awaiting-response per partner.
      admin
        .from("direct_messages")
        .select("id, recipient_id, created_at")
        .eq("sender_id", user.id)
        .gte("created_at", sevenDaysAgoIso)
        .order("created_at", { ascending: false }),
    ]);

    // Awaiting response: for each conversation partner I've messaged
    // in the last 7d, check whether the last message in the
    // conversation is from me. If yes → awaiting response.
    const partnerLatestSent = new Map<string, string>();
    for (const msg of recentMineRes.data ?? []) {
      const partner = msg.recipient_id as string;
      if (!partnerLatestSent.has(partner)) {
        partnerLatestSent.set(partner, msg.created_at as string);
      }
    }
    let awaiting = 0;
    for (const [partner, lastSentAt] of partnerLatestSent.entries()) {
      const { data: latest } = await admin
        .from("direct_messages")
        .select("sender_id, created_at")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${partner}),and(sender_id.eq.${partner},recipient_id.eq.${user.id})`
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        latest &&
        latest.sender_id === user.id &&
        latest.created_at >= lastSentAt
      ) {
        awaiting += 1;
      }
    }

    return {
      unreadCount: unreadRes.count ?? 0,
      awaitingResponseCount: awaiting,
      sentTodayCount: sentTodayRes.count ?? 0,
      // Mentions placeholder — surfaced as 0 until/if a mention
      // notification system is added.
      mentionsCount: 0,
    };
  } catch (err) {
    console.error("getMessagesStatusPulse error:", err);
    return {
      unreadCount: 0,
      awaitingResponseCount: 0,
      sentTodayCount: 0,
      mentionsCount: 0,
    };
  }
}
