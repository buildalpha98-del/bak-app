"use server";

// ============================================================
// Campaigns dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N active · M sends this week · K unsent · F
// discount codes expiring" strip above /admin/campaigns.
//
// Implementation notes:
//   - Active: reengagement_campaigns where status='active'.
//   - Sends this week: reengagement_sends where triggered_at >=
//     Monday.
//   - Unsent: reengagement_sends where status='pending' (queued
//     but not yet emailed).
//   - Discount codes expiring: discount_codes where used=false and
//     expires_at within next 14 days.
//   - Errors swallow to zeros so a single broken query doesn't blank
//     the whole page.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface CampaignsStatusPulse {
  activeCampaignsCount: number;
  sendsThisWeekCount: number;
  unsentCount: number;
  expiringDiscountCodesCount: number;
}

export async function getCampaignsStatusPulse(): Promise<CampaignsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();
    const in14dIso = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString();
    const nowIso = new Date().toISOString();

    const [
      activeRes,
      sendsThisWeekRes,
      unsentRes,
      expiringDiscountsRes,
    ] = await Promise.all([
      supabase
        .from("reengagement_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("reengagement_sends")
        .select("id", { count: "exact", head: true })
        .gte("triggered_at", mondayIso),
      supabase
        .from("reengagement_sends")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("discount_codes")
        .select("id", { count: "exact", head: true })
        .eq("used", false)
        .gte("expires_at", nowIso)
        .lte("expires_at", in14dIso),
    ]);

    return {
      activeCampaignsCount: activeRes.count ?? 0,
      sendsThisWeekCount: sendsThisWeekRes.count ?? 0,
      unsentCount: unsentRes.count ?? 0,
      expiringDiscountCodesCount: expiringDiscountsRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCampaignsStatusPulse error:", err);
    return {
      activeCampaignsCount: 0,
      sendsThisWeekCount: 0,
      unsentCount: 0,
      expiringDiscountCodesCount: 0,
    };
  }
}
