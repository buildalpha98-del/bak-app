"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * List all re-engagement campaigns with recipient counts and engagement rates.
 */
export async function getCampaigns(): Promise<{
  data: Array<{
    id: string;
    name: string;
    audience_type: string;
    status: string;
    created_at: string;
    total_sends: number;
    engaged_count: number;
    engagement_rate: number;
  }> | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: campaigns, error } = await supabase
      .from("reengagement_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    // Get send counts and engagement for each campaign
    const enriched = await Promise.all(
      (campaigns ?? []).map(async (campaign) => {
        const { count: totalSends } = await supabase
          .from("reengagement_sends")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id);

        const { count: engagedCount } = await supabase
          .from("reengagement_sends")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "engaged");

        const total = totalSends ?? 0;
        const engaged = engagedCount ?? 0;

        return {
          id: campaign.id,
          name: campaign.name,
          audience_type: campaign.audience_type,
          status: campaign.status,
          created_at: campaign.created_at,
          total_sends: total,
          engaged_count: engaged,
          engagement_rate: total > 0 ? Math.round((engaged / total) * 100) : 0,
        };
      })
    );

    return { data: enriched, error: null };
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    return { data: null, error: "Failed to fetch campaigns" };
  }
}

/**
 * Get a single campaign with all its re-engagement sends and their statuses.
 */
export async function getCampaignDetail(campaignId: string): Promise<{
  data: {
    campaign: Record<string, unknown>;
    sends: Array<Record<string, unknown>>;
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: campaign, error: campaignError } = await supabase
      .from("reengagement_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return { data: null, error: campaignError?.message ?? "Campaign not found" };
    }

    const { data: sends, error: sendsError } = await supabase
      .from("reengagement_sends")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (sendsError) {
      return { data: null, error: sendsError.message };
    }

    return {
      data: {
        campaign,
        sends: sends ?? [],
      },
      error: null,
    };
  } catch (err) {
    console.error("Error fetching campaign detail:", err);
    return { data: null, error: "Failed to fetch campaign detail" };
  }
}

/**
 * Create a new re-engagement campaign.
 */
export async function createCampaign(data: {
  name: string;
  audienceType: string;
  triggerCondition: Record<string, unknown>;
  emailSequenceId?: string;
}): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: campaign, error } = await supabase
      .from("reengagement_campaigns")
      .insert({
        name: data.name,
        audience_type: data.audienceType,
        trigger_condition: data.triggerCondition,
        email_sequence_id: data.emailSequenceId ?? null,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: campaign, error: null };
  } catch (err) {
    console.error("Error creating campaign:", err);
    return { data: null, error: "Failed to create campaign" };
  }
}

/**
 * Update a campaign's status (active, paused, or inactive).
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: "active" | "paused" | "inactive"
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("reengagement_campaigns")
      .update({ status })
      .eq("id", campaignId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    console.error("Error updating campaign status:", err);
    return { error: "Failed to update campaign status" };
  }
}

/**
 * Get aggregated re-engagement reporting:
 * - Re-engagement rate by audience type
 * - Total sends and engaged counts
 * - ROI metrics
 */
export async function getCampaignReporting(): Promise<{
  data: {
    byAudienceType: Array<{
      audienceType: string;
      totalSends: number;
      totalEngaged: number;
      engagementRate: number;
    }>;
    totals: {
      totalSends: number;
      totalEngaged: number;
      overallEngagementRate: number;
    };
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get all sends with campaign audience type
    const { data: sends, error } = await supabase
      .from("reengagement_sends")
      .select("status, reengagement_campaigns!inner(audience_type)");

    if (error) {
      return { data: null, error: error.message };
    }

    const allSends = (sends ?? []) as unknown as Array<{
      status: string;
      reengagement_campaigns: { audience_type: string };
    }>;

    // Group by audience type
    const audienceMap = new Map<
      string,
      { totalSends: number; totalEngaged: number }
    >();

    for (const send of allSends) {
      const audienceType = send.reengagement_campaigns.audience_type;
      const existing = audienceMap.get(audienceType) ?? {
        totalSends: 0,
        totalEngaged: 0,
      };
      existing.totalSends++;
      if (send.status === "engaged") {
        existing.totalEngaged++;
      }
      audienceMap.set(audienceType, existing);
    }

    const byAudienceType = Array.from(audienceMap.entries()).map(
      ([audienceType, counts]) => ({
        audienceType,
        totalSends: counts.totalSends,
        totalEngaged: counts.totalEngaged,
        engagementRate:
          counts.totalSends > 0
            ? Math.round((counts.totalEngaged / counts.totalSends) * 100)
            : 0,
      })
    );

    const totalSends = allSends.length;
    const totalEngaged = allSends.filter((s) => s.status === "engaged").length;

    return {
      data: {
        byAudienceType,
        totals: {
          totalSends,
          totalEngaged,
          overallEngagementRate:
            totalSends > 0
              ? Math.round((totalEngaged / totalSends) * 100)
              : 0,
        },
      },
      error: null,
    };
  } catch (err) {
    console.error("Error fetching campaign reporting:", err);
    return { data: null, error: "Failed to fetch campaign reporting" };
  }
}

// ============================================================
// Bulk campaign status changes
// ============================================================
//
// Both bulk actions take a list of campaign ids and an action
// ("pause"|"activate") and update each campaign's `status`. Partial
// failure: per-id error so the caller can toast successful count
// and report broken rows.

export interface BulkCampaignResult {
  succeeded: number;
  failed: Array<{ id: string; error: string }>;
}

export async function bulkUpdateCampaignStatus(
  ids: string[],
  status: "active" | "paused" | "inactive"
): Promise<{ data: BulkCampaignResult | null; error: string | null }> {
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
    const { error: updErr } = await supabase
      .from("reengagement_campaigns")
      .update({ status })
      .eq("id", id);
    if (updErr) {
      failed.push({ id, error: updErr.message });
    } else {
      succeeded += 1;
    }
  }

  revalidatePath("/admin/campaigns");

  return { data: { succeeded, failed }, error: null };
}
