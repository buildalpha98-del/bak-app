"use server";

// ============================================================
// Referrals dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N active codes · M conversions this week · K
// rewards pending · F config drift" strip above /admin/referrals.
//
// Implementation notes:
//   - Active codes: status='active'.
//   - Conversions this week: referrals with status='converted' and
//     converted_at >= Monday.
//   - Pending rewards: referral_rewards with status='pending'.
//   - Config drift: count of expected `referral_config` keys missing
//     vs the defaults baseline (parent_instant_reward,
//     parent_milestone, centre_reward). If any are missing the
//     count is the number of missing keys.
//   - Errors swallow to zeros so a single broken query doesn't blank
//     the whole page; mirrors the staff + centres pulse patterns.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface ReferralsStatusPulse {
  activeCodesCount: number;
  conversionsThisWeekCount: number;
  pendingRewardsCount: number;
  configDriftCount: number;
}

const EXPECTED_CONFIG_KEYS = [
  "parent_instant_reward",
  "parent_milestone",
  "centre_reward",
] as const;

export async function getReferralsStatusPulse(): Promise<ReferralsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    const [
      activeCodesRes,
      conversionsRes,
      pendingRewardsRes,
      configKeysRes,
    ] = await Promise.all([
      supabase
        .from("referral_codes")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("status", "converted")
        .gte("converted_at", mondayIso),
      supabase
        .from("referral_rewards")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("referral_config").select("config_key"),
    ]);

    // Config drift: count expected keys that are missing.
    const presentKeys = new Set(
      (configKeysRes.data ?? []).map((r) => r.config_key as string)
    );
    const configDriftCount = EXPECTED_CONFIG_KEYS.filter(
      (k) => !presentKeys.has(k)
    ).length;

    return {
      activeCodesCount: activeCodesRes.count ?? 0,
      conversionsThisWeekCount: conversionsRes.count ?? 0,
      pendingRewardsCount: pendingRewardsRes.count ?? 0,
      configDriftCount,
    };
  } catch (err) {
    console.error("getReferralsStatusPulse error:", err);
    return {
      activeCodesCount: 0,
      conversionsThisWeekCount: 0,
      pendingRewardsCount: 0,
      configDriftCount: 0,
    };
  }
}
