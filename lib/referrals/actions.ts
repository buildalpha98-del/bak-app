"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface ReferralCode {
  id: string;
  code: string;
  owner_type: "parent" | "centre";
  owner_id: string;
  status: "active" | "inactive";
  total_referrals: number;
  total_conversions: number;
  created_at: string;
}

export interface Referral {
  id: string;
  referral_code_id: string;
  referrer_type: string;
  referrer_id: string;
  referred_type: string;
  referred_id: string | null;
  referred_email: string;
  status: "pending" | "registered" | "converted" | "expired";
  conversion_type: string | null;
  converted_at: string | null;
  created_at: string;
}

export interface ReferralReward {
  id: string;
  referral_id: string;
  recipient_type: string;
  recipient_id: string;
  reward_type: "instant_discount" | "milestone_free_session" | "invoice_credit" | "badge";
  reward_value_cents: number | null;
  reward_description: string;
  status: "pending" | "awarded" | "redeemed" | "expired";
  awarded_at: string;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ReferralConfig {
  id: string;
  config_key: string;
  config_value: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

export interface MilestoneProgress {
  currentConversions: number;
  requiredConversions: number;
  rewardDescription: string;
  reached: boolean;
}

export interface ParentReferralData {
  code: ReferralCode | null;
  referrals: Referral[];
  rewards: ReferralReward[];
  milestoneProgress: MilestoneProgress | null;
  stats: {
    totalReferrals: number;
    registeredCount: number;
    convertedCount: number;
  };
}

// ============================================================
// Helpers
// ============================================================

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 for readability
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BAK-${result}`;
}

// ============================================================
// 1. Generate Referral Code
// ============================================================

export async function generateReferralCode(
  ownerType: "parent" | "centre",
  ownerId: string
): Promise<{ data: { code: string; id: string } | null; error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    // Check if owner already has an active code
    const { data: existing } = await admin
      .from("referral_codes")
      .select("id, code")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return { data: { code: existing.code, id: existing.id }, error: null };
    }

    // Generate a unique code
    let code = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: clash } = await admin
        .from("referral_codes")
        .select("id")
        .eq("code", code)
        .maybeSingle();

      if (!clash) break;
      code = generateCode();
      attempts++;
    }

    const { data, error } = await admin
      .from("referral_codes")
      .insert({
        code,
        owner_type: ownerType,
        owner_id: ownerId,
        status: "active",
        total_referrals: 0,
        total_conversions: 0,
      })
      .select("id, code")
      .single();

    if (error) throw error;

    return { data: { code: data.code, id: data.id }, error: null };
  } catch (err) {
    console.error("generateReferralCode error:", err);
    return { data: null, error: "Failed to generate referral code" };
  }
}

// ============================================================
// 2. Get Parent Referral Data
// ============================================================

export async function getParentReferralData(): Promise<{
  data: ParentReferralData | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };

    // Get parent profile
    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { data: null, error: "Parent profile not found" };

    const parentId = parentProfile.id;

    // Get referral code
    const { data: codeRecord } = await supabase
      .from("referral_codes")
      .select("*")
      .eq("owner_type", "parent")
      .eq("owner_id", parentId)
      .eq("status", "active")
      .maybeSingle();

    // If no code, return empty data
    if (!codeRecord) {
      return {
        data: {
          code: null,
          referrals: [],
          rewards: [],
          milestoneProgress: null,
          stats: { totalReferrals: 0, registeredCount: 0, convertedCount: 0 },
        },
        error: null,
      };
    }

    // Get referrals for this code
    const { data: referrals } = await supabase
      .from("referrals")
      .select("*")
      .eq("referral_code_id", codeRecord.id)
      .order("created_at", { ascending: false });

    // Get rewards for this parent
    const { data: rewards } = await supabase
      .from("referral_rewards")
      .select("*")
      .eq("recipient_id", parentId)
      .eq("recipient_type", "parent")
      .order("awarded_at", { ascending: false });

    // Calculate stats
    const referralList = referrals ?? [];
    const registeredCount = referralList.filter(
      (r) => r.status === "registered" || r.status === "converted"
    ).length;
    const convertedCount = referralList.filter(
      (r) => r.status === "converted"
    ).length;

    // Get milestone config
    const admin = createSupabaseAdmin();
    const { data: milestoneConfig } = await admin
      .from("referral_config")
      .select("config_value")
      .eq("config_key", "parent_milestone")
      .maybeSingle();

    let milestoneProgress: MilestoneProgress | null = null;
    if (milestoneConfig?.config_value) {
      const cfg = milestoneConfig.config_value as Record<string, unknown>;
      const required = (cfg.required_conversions as number) ?? 5;
      const desc = (cfg.reward_description as string) ?? "Free session";
      milestoneProgress = {
        currentConversions: codeRecord.total_conversions,
        requiredConversions: required,
        rewardDescription: desc,
        reached: codeRecord.total_conversions >= required,
      };
    }

    return {
      data: {
        code: codeRecord,
        referrals: referralList,
        rewards: rewards ?? [],
        milestoneProgress,
        stats: {
          totalReferrals: codeRecord.total_referrals,
          registeredCount,
          convertedCount,
        },
      },
      error: null,
    };
  } catch (err) {
    console.error("getParentReferralData error:", err);
    return { data: null, error: "Failed to load referral data" };
  }
}

// ============================================================
// 3. Get Referral By Code (public lookup)
// ============================================================

export async function getReferralByCode(code: string): Promise<{
  data: { codeId: string; referrerName: string; ownerType: string } | null;
  error: string | null;
}> {
  try {
    const admin = createSupabaseAdmin();

    const { data: codeRecord, error } = await admin
      .from("referral_codes")
      .select("id, owner_type, owner_id")
      .eq("code", code.toUpperCase().trim())
      .eq("status", "active")
      .maybeSingle();

    if (error) throw error;
    if (!codeRecord) return { data: null, error: "Invalid referral code" };

    let referrerName = "A friend";

    if (codeRecord.owner_type === "parent") {
      const { data: parent } = await admin
        .from("parent_profiles")
        .select("first_name")
        .eq("id", codeRecord.owner_id)
        .single();

      if (parent?.first_name) {
        referrerName = parent.first_name;
      }
    } else if (codeRecord.owner_type === "centre") {
      const { data: centre } = await admin
        .from("centres")
        .select("name")
        .eq("id", codeRecord.owner_id)
        .single();

      if (centre?.name) {
        referrerName = centre.name;
      }
    }

    return {
      data: {
        codeId: codeRecord.id,
        referrerName,
        ownerType: codeRecord.owner_type,
      },
      error: null,
    };
  } catch (err) {
    console.error("getReferralByCode error:", err);
    return { data: null, error: "Failed to look up referral code" };
  }
}

// ============================================================
// 4. Create Referral Record
// ============================================================

export async function createReferralRecord(
  referralCodeId: string,
  referredEmail: string,
  referredType: "parent" | "centre"
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    // Get the code to find the referrer
    const { data: codeRecord } = await admin
      .from("referral_codes")
      .select("owner_type, owner_id")
      .eq("id", referralCodeId)
      .single();

    if (!codeRecord) return { data: null, error: "Referral code not found" };

    // Prevent self-referral by email
    if (codeRecord.owner_type === "parent") {
      const { data: ownerProfile } = await admin
        .from("parent_profiles")
        .select("email")
        .eq("id", codeRecord.owner_id)
        .single();

      if (ownerProfile?.email?.toLowerCase() === referredEmail.toLowerCase()) {
        return { data: null, error: "You cannot refer yourself" };
      }
    }

    // Check for duplicate pending referral
    const { data: existing } = await admin
      .from("referrals")
      .select("id")
      .eq("referral_code_id", referralCodeId)
      .eq("referred_email", referredEmail.toLowerCase())
      .in("status", ["pending", "registered", "converted"])
      .maybeSingle();

    if (existing) {
      return { data: null, error: "This person has already been referred" };
    }

    const { data, error } = await admin
      .from("referrals")
      .insert({
        referral_code_id: referralCodeId,
        referrer_type: codeRecord.owner_type,
        referrer_id: codeRecord.owner_id,
        referred_type: referredType,
        referred_email: referredEmail.toLowerCase(),
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;

    return { data: { id: data.id }, error: null };
  } catch (err) {
    console.error("createReferralRecord error:", err);
    return { data: null, error: "Failed to create referral" };
  }
}

// ============================================================
// 5. Mark Referral Registered
// ============================================================

export async function markReferralRegistered(
  referredEmail: string,
  referredId: string
): Promise<{ error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    // Find pending referral by email
    const { data: referral } = await admin
      .from("referrals")
      .select("id, referral_code_id")
      .eq("referred_email", referredEmail.toLowerCase())
      .eq("status", "pending")
      .maybeSingle();

    if (!referral) {
      // No pending referral — not an error, just means they weren't referred
      return { error: null };
    }

    // Update referral status
    const { error: updateError } = await admin
      .from("referrals")
      .update({
        referred_id: referredId,
        status: "registered",
      })
      .eq("id", referral.id);

    if (updateError) throw updateError;

    // Increment total_referrals on the code
    const { error: rpcError } = await admin.rpc("increment_field", {
      table_name: "referral_codes",
      row_id: referral.referral_code_id,
      field_name: "total_referrals",
      increment_by: 1,
    });

    // Fallback: if RPC doesn't exist, do a manual read-update
    if (rpcError) {
      const { data: codeRecord } = await admin
        .from("referral_codes")
        .select("total_referrals")
        .eq("id", referral.referral_code_id)
        .single();

      if (codeRecord) {
        await admin
          .from("referral_codes")
          .update({ total_referrals: (codeRecord.total_referrals ?? 0) + 1 })
          .eq("id", referral.referral_code_id);
      }
    }

    return { error: null };
  } catch (err) {
    console.error("markReferralRegistered error:", err);
    return { error: "Failed to update referral status" };
  }
}

// ============================================================
// 6. Process Referral Conversion
// ============================================================

export async function processReferralConversion(
  referredId: string,
  conversionType: string
): Promise<{ error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    // Find registered referral by referred_id
    const { data: referral } = await admin
      .from("referrals")
      .select("id, referral_code_id, referrer_type, referrer_id")
      .eq("referred_id", referredId)
      .eq("status", "registered")
      .maybeSingle();

    if (!referral) {
      return { error: null }; // No referral to process
    }

    // Update referral to converted
    const { error: updateError } = await admin
      .from("referrals")
      .update({
        status: "converted",
        conversion_type: conversionType,
        converted_at: new Date().toISOString(),
      })
      .eq("id", referral.id);

    if (updateError) throw updateError;

    // Increment total_conversions on the code
    const { data: codeRecord } = await admin
      .from("referral_codes")
      .select("total_conversions")
      .eq("id", referral.referral_code_id)
      .single();

    const newTotalConversions = (codeRecord?.total_conversions ?? 0) + 1;

    await admin
      .from("referral_codes")
      .update({ total_conversions: newTotalConversions })
      .eq("id", referral.referral_code_id);

    // Get instant reward config
    const { data: instantConfig } = await admin
      .from("referral_config")
      .select("config_value")
      .eq("config_key", "parent_instant_reward")
      .maybeSingle();

    if (instantConfig?.config_value) {
      const cfg = instantConfig.config_value as Record<string, unknown>;
      const rewardType = (cfg.reward_type as string) ?? "instant_discount";
      const valueCents = (cfg.value_cents as number) ?? 0;
      const description =
        (cfg.description as string) ?? "Referral reward";
      const expiryDays = (cfg.expiry_days as number) ?? 90;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      await admin.from("referral_rewards").insert({
        referral_id: referral.id,
        recipient_type: referral.referrer_type,
        recipient_id: referral.referrer_id,
        reward_type: rewardType,
        reward_value_cents: valueCents,
        reward_description: description,
        status: "awarded",
        awarded_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      });
    }

    // Check milestone
    const { data: milestoneConfig } = await admin
      .from("referral_config")
      .select("config_value")
      .eq("config_key", "parent_milestone")
      .maybeSingle();

    if (milestoneConfig?.config_value) {
      const cfg = milestoneConfig.config_value as Record<string, unknown>;
      const requiredConversions = (cfg.required_conversions as number) ?? 5;
      const milestoneRewardType =
        (cfg.reward_type as string) ?? "milestone_free_session";
      const milestoneDescription =
        (cfg.reward_description as string) ?? "Free session for milestone";
      const milestoneValueCents = (cfg.value_cents as number) ?? null;
      const milestoneExpiryDays = (cfg.expiry_days as number) ?? 180;

      if (newTotalConversions >= requiredConversions) {
        // Check this milestone hasn't already been awarded
        const { data: existingMilestone } = await admin
          .from("referral_rewards")
          .select("id")
          .eq("recipient_id", referral.referrer_id)
          .eq("reward_type", "milestone_free_session")
          .maybeSingle();

        if (!existingMilestone) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + milestoneExpiryDays);

          await admin.from("referral_rewards").insert({
            referral_id: referral.id,
            recipient_type: referral.referrer_type,
            recipient_id: referral.referrer_id,
            reward_type: milestoneRewardType,
            reward_value_cents: milestoneValueCents,
            reward_description: milestoneDescription,
            status: "awarded",
            awarded_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
          });
        }
      }
    }

    revalidatePath("/admin/referrals");

    return { error: null };
  } catch (err) {
    console.error("processReferralConversion error:", err);
    return { error: "Failed to process referral conversion" };
  }
}

// ============================================================
// 7. Get Parent Referral Credits
// ============================================================

export async function getParentReferralCredits(parentId: string): Promise<{
  data: {
    creditCents: number;
    hasFreeSession: boolean;
    rewards: ReferralReward[];
  } | null;
  error: string | null;
}> {
  try {
    const admin = createSupabaseAdmin();

    const { data: rewards, error } = await admin
      .from("referral_rewards")
      .select("*")
      .eq("recipient_id", parentId)
      .eq("recipient_type", "parent")
      .eq("status", "awarded")
      .order("awarded_at", { ascending: false });

    if (error) throw error;

    const rewardList = rewards ?? [];

    const creditCents = rewardList
      .filter(
        (r) =>
          r.reward_type === "instant_discount" ||
          r.reward_type === "invoice_credit"
      )
      .reduce((sum: number, r) => sum + (r.reward_value_cents ?? 0), 0);

    const hasFreeSession = rewardList.some(
      (r) => r.reward_type === "milestone_free_session"
    );

    return {
      data: { creditCents, hasFreeSession, rewards: rewardList },
      error: null,
    };
  } catch (err) {
    console.error("getParentReferralCredits error:", err);
    return { data: null, error: "Failed to load referral credits" };
  }
}

// ============================================================
// 8. Redeem Referral Reward
// ============================================================

export async function redeemReferralReward(
  rewardId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify this reward belongs to the authenticated user's parent profile
    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { error: "Parent profile not found" };

    const admin = createSupabaseAdmin();

    // Verify ownership and status
    const { data: reward } = await admin
      .from("referral_rewards")
      .select("id, recipient_id, status")
      .eq("id", rewardId)
      .single();

    if (!reward) return { error: "Reward not found" };
    if (reward.recipient_id !== parentProfile.id) return { error: "Unauthorised" };
    if (reward.status !== "awarded") return { error: "Reward is not available for redemption" };

    const { error: updateError } = await admin
      .from("referral_rewards")
      .update({
        status: "redeemed",
        redeemed_at: new Date().toISOString(),
      })
      .eq("id", rewardId);

    if (updateError) throw updateError;

    revalidatePath("/parent/referrals");

    return { error: null };
  } catch (err) {
    console.error("redeemReferralReward error:", err);
    return { error: "Failed to redeem reward" };
  }
}

// ============================================================
// 9. Admin Actions
// ============================================================

// --- Admin Referral Dashboard ---

export async function getAdminReferralDashboard(): Promise<{
  data: {
    activeCodes: number;
    totalReferrals: number;
    totalConversions: number;
    conversionRate: number;
    totalRewardsAwarded: number;
    recentParentReferrals: Referral[];
    recentCentreReferrals: Referral[];
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Verify admin role
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") return { data: null, error: "Unauthorised" };

    const admin = createSupabaseAdmin();

    // Active codes count
    const { count: activeCodes } = await admin
      .from("referral_codes")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    // Totals from referrals table
    const { count: totalReferrals } = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true });

    const { count: totalConversions } = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("status", "converted");

    // Rewards awarded
    const { count: totalRewardsAwarded } = await admin
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .in("status", ["awarded", "redeemed"]);

    // Recent parent referrals
    const { data: recentParent } = await admin
      .from("referrals")
      .select("*")
      .eq("referrer_type", "parent")
      .order("created_at", { ascending: false })
      .limit(20);

    // Recent centre referrals
    const { data: recentCentre } = await admin
      .from("referrals")
      .select("*")
      .eq("referrer_type", "centre")
      .order("created_at", { ascending: false })
      .limit(20);

    const refCount = totalReferrals ?? 0;
    const convCount = totalConversions ?? 0;
    const conversionRate = refCount > 0 ? (convCount / refCount) * 100 : 0;

    return {
      data: {
        activeCodes: activeCodes ?? 0,
        totalReferrals: refCount,
        totalConversions: convCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalRewardsAwarded: totalRewardsAwarded ?? 0,
        recentParentReferrals: recentParent ?? [],
        recentCentreReferrals: recentCentre ?? [],
      },
      error: null,
    };
  } catch (err) {
    console.error("getAdminReferralDashboard error:", err);
    return { data: null, error: "Failed to load referral dashboard" };
  }
}

// --- Admin Referral Config ---

export async function getAdminReferralConfig(): Promise<{
  data: ReferralConfig[] | null;
  error: string | null;
}> {
  try {
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

    if (profile?.role !== "admin") return { data: null, error: "Unauthorised" };

    const admin = createSupabaseAdmin();

    const { data, error } = await admin
      .from("referral_config")
      .select("*")
      .order("config_key");

    if (error) throw error;

    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getAdminReferralConfig error:", err);
    return { data: null, error: "Failed to load referral config" };
  }
}

// --- Update Referral Config ---

export async function updateReferralConfig(
  configKey: string,
  configValue: Record<string, unknown>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") return { error: "Unauthorised" };

    const admin = createSupabaseAdmin();

    const { error } = await admin
      .from("referral_config")
      .upsert(
        {
          config_key: configKey,
          config_value: configValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "config_key" }
      );

    if (error) throw error;

    revalidatePath("/admin/referrals");

    return { error: null };
  } catch (err) {
    console.error("updateReferralConfig error:", err);
    return { error: "Failed to update referral config" };
  }
}

// --- Generate Centre Referral Codes ---

export async function generateCentreReferralCodes(): Promise<{
  data: { generated: number } | null;
  error: string | null;
}> {
  try {
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

    if (profile?.role !== "admin" && profile?.role !== "ops")
      return { data: null, error: "Unauthorised" };

    const admin = createSupabaseAdmin();

    // Get active centres
    const { data: centres } = await admin
      .from("centres")
      .select("id")
      .eq("contract_status", "active");

    if (!centres || centres.length === 0) {
      return { data: { generated: 0 }, error: null };
    }

    // Get centres that already have codes
    const { data: existingCodes } = await admin
      .from("referral_codes")
      .select("owner_id")
      .eq("owner_type", "centre")
      .eq("status", "active");

    const existingOwnerIds = new Set(
      (existingCodes ?? []).map((c) => c.owner_id)
    );

    const centresNeedingCodes = centres.filter(
      (c) => !existingOwnerIds.has(c.id)
    );

    if (centresNeedingCodes.length === 0) {
      return { data: { generated: 0 }, error: null };
    }

    // Generate codes for each centre
    const records = [];
    const usedCodes = new Set<string>();

    for (const centre of centresNeedingCodes) {
      let code = generateCode();
      while (usedCodes.has(code)) {
        code = generateCode();
      }
      usedCodes.add(code);

      records.push({
        code,
        owner_type: "centre" as const,
        owner_id: centre.id,
        status: "active" as const,
        total_referrals: 0,
        total_conversions: 0,
      });
    }

    const { error } = await admin.from("referral_codes").insert(records);

    if (error) throw error;

    revalidatePath("/admin/referrals");

    return { data: { generated: records.length }, error: null };
  } catch (err) {
    console.error("generateCentreReferralCodes error:", err);
    return { data: null, error: "Failed to generate centre referral codes" };
  }
}

// --- Get Centre Referral Stats ---

export async function getCentreReferralStats(centreId: string): Promise<{
  data: {
    code: ReferralCode | null;
    totalReferrals: number;
    totalConversions: number;
    conversionRate: number;
    referrals: Referral[];
    rewards: ReferralReward[];
  } | null;
  error: string | null;
}> {
  try {
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

    if (profile?.role !== "admin" && profile?.role !== "ops")
      return { data: null, error: "Unauthorised" };

    const admin = createSupabaseAdmin();

    // Get centre's referral code
    const { data: codeRecord } = await admin
      .from("referral_codes")
      .select("*")
      .eq("owner_type", "centre")
      .eq("owner_id", centreId)
      .eq("status", "active")
      .maybeSingle();

    if (!codeRecord) {
      return {
        data: {
          code: null,
          totalReferrals: 0,
          totalConversions: 0,
          conversionRate: 0,
          referrals: [],
          rewards: [],
        },
        error: null,
      };
    }

    // Get referrals for this code
    const { data: referrals } = await admin
      .from("referrals")
      .select("*")
      .eq("referral_code_id", codeRecord.id)
      .order("created_at", { ascending: false });

    // Get rewards created from this centre's referrals
    const referralIds = (referrals ?? []).map((r) => r.id);
    let rewards: ReferralReward[] = [];

    if (referralIds.length > 0) {
      const { data: rewardData } = await admin
        .from("referral_rewards")
        .select("*")
        .in("referral_id", referralIds)
        .order("awarded_at", { ascending: false });

      rewards = rewardData ?? [];
    }

    const totalReferrals = codeRecord.total_referrals ?? 0;
    const totalConversions = codeRecord.total_conversions ?? 0;
    const conversionRate =
      totalReferrals > 0
        ? Math.round((totalConversions / totalReferrals) * 1000) / 10
        : 0;

    return {
      data: {
        code: codeRecord,
        totalReferrals,
        totalConversions,
        conversionRate,
        referrals: referrals ?? [],
        rewards,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCentreReferralStats error:", err);
    return { data: null, error: "Failed to load centre referral stats" };
  }
}
