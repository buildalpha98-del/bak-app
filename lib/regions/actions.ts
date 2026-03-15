"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Region } from "@/lib/types/database";
import type { RegionStatus } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface RegionListItem extends Region {
  centre_count: number;
  lead_count: number;
  coach_count: number;
}

export interface RegionDashboardStats {
  region: Region;
  centreCount: number;
  activeSessions: number;
  totalLeads: number;
  wonLeads: number;
  coachCount: number;
  revenueThisMonth: number;
  centresByStatus: { status: string; count: number }[];
  leadsByStage: { stage: string; count: number }[];
}

export interface CreateRegionData {
  name: string;
  code: string;
  state: string;
  suburbs: string[];
  target_centres?: number | null;
  regional_manager_id?: string | null;
  notes?: string | null;
  status?: RegionStatus;
}

export interface UpdateRegionData {
  name?: string;
  code?: string;
  state?: string;
  suburbs?: string[];
  target_centres?: number | null;
  regional_manager_id?: string | null;
  notes?: string | null;
  status?: RegionStatus;
}

// ============================================================
// 1. Get Regions (list with counts)
// ============================================================

export async function getRegions(): Promise<{
  data: RegionListItem[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: regions, error } = await supabase
      .from("regions")
      .select("*")
      .order("name");

    if (error) throw error;
    if (!regions) return { data: [], error: null };

    // Fetch counts in parallel
    const [centresResult, leadsResult, profilesResult] = await Promise.all([
      supabase
        .from("centres")
        .select("id, region_id")
        .not("region_id", "is", null),
      supabase
        .from("leads")
        .select("id, region_id")
        .not("region_id", "is", null),
      supabase
        .from("profiles")
        .select("id, region_ids")
        .not("region_ids", "is", null),
    ]);

    const centreCounts: Record<string, number> = {};
    const leadCounts: Record<string, number> = {};
    const coachCounts: Record<string, number> = {};

    (centresResult.data ?? []).forEach((c) => {
      if (c.region_id) {
        centreCounts[c.region_id] = (centreCounts[c.region_id] || 0) + 1;
      }
    });

    (leadsResult.data ?? []).forEach((l) => {
      if (l.region_id) {
        leadCounts[l.region_id] = (leadCounts[l.region_id] || 0) + 1;
      }
    });

    (profilesResult.data ?? []).forEach((p) => {
      const regionIds = p.region_ids as string[] | null;
      if (regionIds && Array.isArray(regionIds)) {
        regionIds.forEach((rid) => {
          coachCounts[rid] = (coachCounts[rid] || 0) + 1;
        });
      }
    });

    const items: RegionListItem[] = regions.map((r) => ({
      ...r,
      suburbs: r.suburbs ?? [],
      centre_count: centreCounts[r.id] || 0,
      lead_count: leadCounts[r.id] || 0,
      coach_count: coachCounts[r.id] || 0,
    }));

    return { data: items, error: null };
  } catch (err) {
    console.error("getRegions error:", err);
    return { data: null, error: "Failed to load regions" };
  }
}

// ============================================================
// 2. Get Region (single with details)
// ============================================================

export async function getRegion(
  id: string
): Promise<{ data: Region | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("regions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    return {
      data: data ? { ...data, suburbs: data.suburbs ?? [] } : null,
      error: null,
    };
  } catch (err) {
    console.error("getRegion error:", err);
    return { data: null, error: "Failed to load region" };
  }
}

// ============================================================
// 3. Create Region
// ============================================================

export async function createRegion(
  regionData: CreateRegionData
): Promise<{ data: Region | null; error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    // Validate required fields
    if (!regionData.name?.trim()) {
      return { data: null, error: "Region name is required" };
    }
    if (!regionData.code?.trim()) {
      return { data: null, error: "Region code is required" };
    }
    if (!regionData.state?.trim()) {
      return { data: null, error: "State is required" };
    }

    // Check for duplicate code
    const { data: existing } = await admin
      .from("regions")
      .select("id")
      .eq("code", regionData.code.toUpperCase().trim())
      .maybeSingle();

    if (existing) {
      return { data: null, error: "A region with this code already exists" };
    }

    const { data, error } = await admin
      .from("regions")
      .insert({
        name: regionData.name.trim(),
        code: regionData.code.toUpperCase().trim(),
        state: regionData.state,
        suburbs: regionData.suburbs.map((s) => s.trim().toLowerCase()),
        target_centres: regionData.target_centres ?? null,
        regional_manager_id: regionData.regional_manager_id ?? null,
        notes: regionData.notes ?? null,
        status: regionData.status ?? "planned",
        is_franchise: false,
        data_isolation_level: null,
      })
      .select("*")
      .single();

    if (error) throw error;

    revalidatePath("/admin/settings/regions");
    return { data: { ...data, suburbs: data.suburbs ?? [] }, error: null };
  } catch (err) {
    console.error("createRegion error:", err);
    return { data: null, error: "Failed to create region" };
  }
}

// ============================================================
// 4. Update Region
// ============================================================

export async function updateRegion(
  id: string,
  updates: UpdateRegionData
): Promise<{ data: Region | null; error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    // If code is being updated, check for duplicates
    if (updates.code) {
      const { data: existing } = await admin
        .from("regions")
        .select("id")
        .eq("code", updates.code.toUpperCase().trim())
        .neq("id", id)
        .maybeSingle();

      if (existing) {
        return { data: null, error: "A region with this code already exists" };
      }
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updatePayload.name = updates.name.trim();
    if (updates.code !== undefined)
      updatePayload.code = updates.code.toUpperCase().trim();
    if (updates.state !== undefined) updatePayload.state = updates.state;
    if (updates.suburbs !== undefined)
      updatePayload.suburbs = updates.suburbs.map((s) =>
        s.trim().toLowerCase()
      );
    if (updates.target_centres !== undefined)
      updatePayload.target_centres = updates.target_centres;
    if (updates.regional_manager_id !== undefined)
      updatePayload.regional_manager_id = updates.regional_manager_id;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.status !== undefined) updatePayload.status = updates.status;

    const { data, error } = await admin
      .from("regions")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    revalidatePath("/admin/settings/regions");
    return { data: { ...data, suburbs: data.suburbs ?? [] }, error: null };
  } catch (err) {
    console.error("updateRegion error:", err);
    return { data: null, error: "Failed to update region" };
  }
}

// ============================================================
// 5. Delete Region (soft delete — set inactive)
// ============================================================

export async function deleteRegion(
  id: string
): Promise<{ data: null; error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    const { error } = await admin
      .from("regions")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/admin/settings/regions");
    return { data: null, error: null };
  } catch (err) {
    console.error("deleteRegion error:", err);
    return { data: null, error: "Failed to deactivate region" };
  }
}

// ============================================================
// 6. Auto-assign Region by Suburb
// ============================================================

export async function autoAssignRegion(
  suburb: string
): Promise<{ data: { regionId: string; regionName: string } | null; error: string | null }> {
  try {
    const admin = createSupabaseAdmin();

    const { data: regions, error } = await admin
      .from("regions")
      .select("id, name, suburbs")
      .eq("status", "active");

    if (error) throw error;
    if (!regions) return { data: null, error: null };

    const normalised = suburb.trim().toLowerCase();

    for (const region of regions) {
      const suburbs = (region.suburbs as string[]) ?? [];
      if (suburbs.some((s) => s.toLowerCase() === normalised)) {
        return {
          data: { regionId: region.id, regionName: region.name },
          error: null,
        };
      }
    }

    return { data: null, error: null };
  } catch (err) {
    console.error("autoAssignRegion error:", err);
    return { data: null, error: "Failed to auto-assign region" };
  }
}

// ============================================================
// 7. Get Region Dashboard
// ============================================================

export async function getRegionDashboard(
  regionId: string
): Promise<{ data: RegionDashboardStats | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch region
    const { data: region, error: regionError } = await supabase
      .from("regions")
      .select("*")
      .eq("id", regionId)
      .single();

    if (regionError) throw regionError;
    if (!region) return { data: null, error: "Region not found" };

    // Fetch related data in parallel
    const [centresResult, leadsResult, profilesResult, sessionsResult] =
      await Promise.all([
        supabase
          .from("centres")
          .select("id, contract_status")
          .eq("region_id", regionId),
        supabase
          .from("leads")
          .select("id, stage")
          .eq("region_id", regionId),
        supabase
          .from("profiles")
          .select("id, region_ids")
          .not("region_ids", "is", null),
        supabase
          .from("sessions")
          .select("id, centre_id")
          .in(
            "centre_id",
            (
              await supabase
                .from("centres")
                .select("id")
                .eq("region_id", regionId)
            ).data?.map((c) => c.id) ?? []
          ),
      ]);

    const centres = centresResult.data ?? [];
    const leads = leadsResult.data ?? [];
    const sessions = sessionsResult.data ?? [];

    // Count coaches assigned to this region
    const coaches = (profilesResult.data ?? []).filter((p) => {
      const rids = p.region_ids as string[] | null;
      return rids && Array.isArray(rids) && rids.includes(regionId);
    });

    // Centre status breakdown
    const centreStatusMap: Record<string, number> = {};
    centres.forEach((c) => {
      const status = (c.contract_status as string) || "unknown";
      centreStatusMap[status] = (centreStatusMap[status] || 0) + 1;
    });

    // Lead stage breakdown
    const leadStageMap: Record<string, number> = {};
    leads.forEach((l) => {
      const stage = (l.stage as string) || "unknown";
      leadStageMap[stage] = (leadStageMap[stage] || 0) + 1;
    });

    // Revenue: sum outbound invoices for centres in this region this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const centreIds = centres.map((c) => c.id);
    let revenueThisMonth = 0;

    if (centreIds.length > 0) {
      const { data: invoices } = await supabase
        .from("outbound_invoices")
        .select("amount")
        .in("centre_id", centreIds)
        .gte("period_start", monthStart)
        .lte("period_start", monthEnd);

      revenueThisMonth = (invoices ?? []).reduce(
        (sum, inv) => sum + (inv.amount || 0),
        0
      );
    }

    const stats: RegionDashboardStats = {
      region: { ...region, suburbs: region.suburbs ?? [] },
      centreCount: centres.length,
      activeSessions: sessions.length,
      totalLeads: leads.length,
      wonLeads: leads.filter((l) => l.stage === "won").length,
      coachCount: coaches.length,
      revenueThisMonth,
      centresByStatus: Object.entries(centreStatusMap).map(
        ([status, count]) => ({ status, count })
      ),
      leadsByStage: Object.entries(leadStageMap).map(([stage, count]) => ({
        stage,
        count,
      })),
    };

    return { data: stats, error: null };
  } catch (err) {
    console.error("getRegionDashboard error:", err);
    return { data: null, error: "Failed to load region dashboard" };
  }
}
