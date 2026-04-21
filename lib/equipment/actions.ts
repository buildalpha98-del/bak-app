"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  EquipmentLocationType,
  EquipmentCondition,
  ItemCondition,
  EquipmentAction,
} from "@/lib/types/enums";
import type {
  EquipmentKit,
  EquipmentItem,
  EquipmentLog,
} from "@/lib/types/database";
import type {
  KitListItem,
  KitDetail,
  CreateKitInput,
  UpdateKitInput,
  AddItemInput,
  UpdateItemInput,
  ReportIssueInput,
  KitFilters,
  InventoryItem,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
} from "@/lib/equipment/types";

// ============================================================
// Helpers
// ============================================================

/**
 * Generate next kit ID (KIT-001, KIT-002, etc.)
 */
async function generateKitId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("equipment_kits")
    .select("*", { count: "exact", head: true });
  const nextNum = (count ?? 0) + 1;
  return `KIT-${String(nextNum).padStart(3, "0")}`;
}

// ============================================================
// Kit CRUD
// ============================================================

export async function getKits(
  filters?: KitFilters
): Promise<{ data: KitListItem[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Get all kits
  let query = supabase
    .from("equipment_kits")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.locationType && filters.locationType !== "all") {
    query = query.eq("location_type", filters.locationType);
  }
  if (filters?.condition && filters.condition !== "all") {
    query = query.eq("condition", filters.condition);
  }
  if (filters?.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  const { data: kits, error } = await query;
  if (error) return { data: null, error: error.message };

  // Enrich with item counts and location names
  const enriched: KitListItem[] = [];
  for (const kit of kits ?? []) {
    // Item count
    const { count } = await supabase
      .from("equipment_items")
      .select("*", { count: "exact", head: true })
      .eq("kit_id", kit.id);

    // Location name
    let assignedCoachName: string | null = null;
    let assignedCentreName: string | null = null;

    if (kit.location_type === "coach" && kit.location_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", kit.location_id)
        .single();
      assignedCoachName = profile?.name ?? null;
    } else if (kit.location_type === "centre" && kit.location_id) {
      const { data: centre } = await supabase
        .from("centres")
        .select("name")
        .eq("id", kit.location_id)
        .single();
      assignedCentreName = centre?.name ?? null;
    }

    enriched.push({
      ...kit,
      item_count: count ?? 0,
      assigned_coach_name: assignedCoachName,
      assigned_centre_name: assignedCentreName,
    });
  }

  return { data: enriched, error: null };
}

export async function getKitDetail(
  kitId: string
): Promise<{ data: KitDetail | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Kit
  const { data: kit, error } = await supabase
    .from("equipment_kits")
    .select("*")
    .eq("id", kitId)
    .single();
  if (error || !kit) return { data: null, error: error?.message ?? "Not found" };

  // Items
  const { data: items } = await supabase
    .from("equipment_items")
    .select("*")
    .eq("kit_id", kitId)
    .order("item_type", { ascending: true });

  // Logs with user names
  const { data: rawLogs } = await supabase
    .from("equipment_logs")
    .select("*")
    .eq("kit_id", kitId)
    .order("created_at", { ascending: false })
    .limit(50);

  const logs: (EquipmentLog & { user_name: string })[] = [];
  for (const log of rawLogs ?? []) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", log.user_id)
      .single();
    logs.push({ ...log, user_name: profile?.name ?? "Unknown" });
  }

  // Location name
  let assignedCoachName: string | null = null;
  let assignedCentreName: string | null = null;

  if (kit.location_type === "coach" && kit.location_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", kit.location_id)
      .single();
    assignedCoachName = profile?.name ?? null;
  } else if (kit.location_type === "centre" && kit.location_id) {
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", kit.location_id)
      .single();
    assignedCentreName = centre?.name ?? null;
  }

  // Linked session (next upcoming session using this kit)
  let linkedSession: KitDetail["linked_session"] = null;
  const { data: session } = await supabase
    .from("sessions")
    .select("id, date, sport, centre_id")
    .eq("equipment_kit_id", kitId)
    .gte("date", new Date().toISOString().split("T")[0])
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (session) {
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", session.centre_id)
      .single();
    linkedSession = {
      id: session.id,
      date: session.date,
      sport: session.sport,
      centre_name: centre?.name ?? "Unknown",
    };
  }

  return {
    data: {
      ...kit,
      items: items ?? [],
      logs,
      assigned_coach_name: assignedCoachName,
      assigned_centre_name: assignedCentreName,
      linked_session: linkedSession,
    },
    error: null,
  };
}

export async function createKit(
  input: CreateKitInput
): Promise<{ data: EquipmentKit | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const kitName = input.name.trim() || (await generateKitId());

  const { data: kit, error } = await supabase
    .from("equipment_kits")
    .insert({
      name: kitName,
      location_type: input.locationType,
      location_id: input.locationId,
      condition: input.condition,
      notes: input.notes,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Insert items
  if (input.items.length > 0) {
    const itemRows = input.items.map((item) => ({
      kit_id: kit.id,
      item_type: item.itemType,
      quantity: item.quantity,
      condition: item.condition,
    }));
    await supabase.from("equipment_items").insert(itemRows);
  }

  // Log creation
  await supabase.from("equipment_logs").insert({
    kit_id: kit.id,
    action: "created" as EquipmentAction,
    user_id: user.id,
    notes: `Kit "${kitName}" created with ${input.items.length} item type(s).`,
  });

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "equipment_kit_created",
    entity_type: "equipment_kit",
    entity_id: kit.id,
    metadata: { name: kitName },
  });

  return { data: kit, error: null };
}

export async function updateKit(
  kitId: string,
  input: UpdateKitInput
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.locationType !== undefined) updates.location_type = input.locationType;
  if (input.locationId !== undefined) updates.location_id = input.locationId;
  if (input.condition !== undefined) updates.condition = input.condition;
  if (input.notes !== undefined) updates.notes = input.notes;

  const { error } = await supabase
    .from("equipment_kits")
    .update(updates)
    .eq("id", kitId);

  if (error) return { error: error.message };

  await supabase.from("equipment_logs").insert({
    kit_id: kitId,
    action: "updated" as EquipmentAction,
    user_id: user.id,
    notes: `Kit updated: ${Object.keys(updates).join(", ")}`,
  });

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "equipment_kit_updated",
    entity_type: "equipment_kit",
    entity_id: kitId,
    metadata: updates,
  });

  return { error: null };
}

export async function deleteKit(
  kitId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Only admin can delete kits." };

  // Check if assigned to any upcoming session
  const { count } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("equipment_kit_id", kitId)
    .gte("date", new Date().toISOString().split("T")[0]);
  if ((count ?? 0) > 0) {
    return { error: "Cannot delete kit assigned to upcoming sessions." };
  }

  // Delete items first
  await supabase.from("equipment_items").delete().eq("kit_id", kitId);
  await supabase.from("equipment_logs").delete().eq("kit_id", kitId);

  const { error } = await supabase
    .from("equipment_kits")
    .delete()
    .eq("id", kitId);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "equipment_kit_deleted",
    entity_type: "equipment_kit",
    entity_id: kitId,
  });

  return { error: null };
}

// ============================================================
// Item CRUD
// ============================================================

export async function addItem(
  input: AddItemInput
): Promise<{ data: EquipmentItem | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("equipment_items")
    .insert({
      kit_id: input.kitId,
      item_type: input.itemType,
      quantity: input.quantity,
      condition: input.condition,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await supabase.from("equipment_logs").insert({
    kit_id: input.kitId,
    action: "updated" as EquipmentAction,
    user_id: user.id,
    notes: `Added item: ${input.itemType} (x${input.quantity})`,
  });

  return { data, error: null };
}

export async function updateItem(
  itemId: string,
  input: UpdateItemInput
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {};
  if (input.quantity !== undefined) updates.quantity = input.quantity;
  if (input.condition !== undefined) updates.condition = input.condition;

  const { error } = await supabase
    .from("equipment_items")
    .update(updates)
    .eq("id", itemId);

  return { error: error?.message ?? null };
}

export async function removeItem(
  itemId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("equipment_items")
    .delete()
    .eq("id", itemId);

  return { error: error?.message ?? null };
}

// ============================================================
// Check-out / Check-in / Issue Reporting
// ============================================================

export async function checkOutKit(
  kitId: string,
  toLocationType: EquipmentLocationType,
  toLocationId: string | null,
  notes?: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("equipment_kits")
    .update({
      location_type: toLocationType,
      location_id: toLocationId,
    })
    .eq("id", kitId);

  if (error) return { error: error.message };

  await supabase.from("equipment_logs").insert({
    kit_id: kitId,
    action: "check_out" as EquipmentAction,
    user_id: user.id,
    notes: notes ?? `Checked out to ${toLocationType}`,
  });

  return { error: null };
}

export async function checkInKit(
  kitId: string,
  notes?: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("equipment_kits")
    .update({
      location_type: "storage" as EquipmentLocationType,
      location_id: null,
    })
    .eq("id", kitId);

  if (error) return { error: error.message };

  await supabase.from("equipment_logs").insert({
    kit_id: kitId,
    action: "check_in" as EquipmentAction,
    user_id: user.id,
    notes: notes ?? "Checked in — all good",
  });

  return { error: null };
}

export async function reportIssue(
  input: ReportIssueInput
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Update kit condition
  await supabase
    .from("equipment_kits")
    .update({ condition: "needs_attention" as EquipmentCondition })
    .eq("id", input.kitId);

  // Log issue
  await supabase.from("equipment_logs").insert({
    kit_id: input.kitId,
    action: "issue_flagged" as EquipmentAction,
    user_id: user.id,
    notes: input.notes,
    issues_json: input.issuesJson,
  });

  // Get kit name for task title
  const { data: kit } = await supabase
    .from("equipment_kits")
    .select("name")
    .eq("id", input.kitId)
    .single();

  // Auto-create Kanban task linked to this kit (with deduplication)
  const { autoCreateTask } = await import("@/lib/tasks/auto-create");
  await autoCreateTask({
    title: `Resolve equipment issue: ${kit?.name ?? "Unknown Kit"}`,
    description: input.notes,
    priority: "high",
    linkedEntityType: "equipment_kit",
    linkedEntityId: input.kitId,
    source: "equipment_issue",
  });

  // Log to activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "equipment_issue_reported",
    entity_type: "equipment_kit",
    entity_id: input.kitId,
    metadata: { notes: input.notes, issues: input.issuesJson },
  });

  return { error: null };
}

// ============================================================
// Coach-specific queries
// ============================================================

export async function getCoachAssignedKits(): Promise<{
  data: KitListItem[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: kits, error } = await supabase
    .from("equipment_kits")
    .select("*")
    .eq("location_type", "coach")
    .eq("location_id", user.id)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };

  const enriched: KitListItem[] = [];
  for (const kit of kits ?? []) {
    const { count } = await supabase
      .from("equipment_items")
      .select("*", { count: "exact", head: true })
      .eq("kit_id", kit.id);

    enriched.push({
      ...kit,
      item_count: count ?? 0,
      assigned_coach_name: null,
      assigned_centre_name: null,
    });
  }

  return { data: enriched, error: null };
}

export async function coachCheckIn(
  kitId: string,
  allGood: boolean,
  issueNotes?: string,
  issuesJson?: Record<string, unknown>
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (allGood) {
    // Log check-in as all good
    await supabase.from("equipment_logs").insert({
      kit_id: kitId,
      action: "check_in" as EquipmentAction,
      user_id: user.id,
      notes: "Coach check-in: All good",
    });
    return { error: null };
  }

  // Report issue
  return reportIssue({
    kitId,
    notes: issueNotes ?? "Issue reported by coach",
    issuesJson: issuesJson ?? {},
  });
}

// ============================================================
// Kit assignment helpers (for roster integration)
// ============================================================

export async function getAvailableKitsForSport(
  sport: string
): Promise<{ data: KitListItem[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Get all kits in storage (available for assignment)
  const { data: kits, error } = await supabase
    .from("equipment_kits")
    .select("*")
    .eq("location_type", "storage")
    .eq("condition", "good")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };

  const enriched: KitListItem[] = [];
  for (const kit of kits ?? []) {
    const { count } = await supabase
      .from("equipment_items")
      .select("*", { count: "exact", head: true })
      .eq("kit_id", kit.id);

    enriched.push({
      ...kit,
      item_count: count ?? 0,
      assigned_coach_name: null,
      assigned_centre_name: null,
    });
  }

  return { data: enriched, error: null };
}

export async function assignKitToSession(
  sessionId: string,
  kitId: string | null
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("sessions")
    .update({ equipment_kit_id: kitId })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: kitId ? "equipment_kit_assigned" : "equipment_kit_unassigned",
    entity_type: "session",
    entity_id: sessionId,
    metadata: { kit_id: kitId },
  });

  return { error: null };
}

// ============================================================
// Lookup helpers (for dropdowns)
// ============================================================

export async function getCoachesSimple(): Promise<{
  data: { id: string; name: string }[] | null;
  error: string | null;
}> {
  // Use admin client — reference data all authenticated users should see
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "coach")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };

  return {
    data: (data ?? []).map((p) => ({ id: p.id, name: p.name ?? "Unknown" })),
    error: null,
  };
}

export async function getCentresSimple(): Promise<{
  data: { id: string; name: string }[] | null;
  error: string | null;
}> {
  // Use admin client — reference data all authenticated users should see
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("centres")
    .select("id, name")
    .eq("contract_status", "active")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };

  return {
    data: (data ?? []).map((c) => ({ id: c.id, name: c.name })),
    error: null,
  };
}

export async function getKitLogs(
  kitId: string
): Promise<{
  data: (EquipmentLog & { user_name: string })[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: rawLogs, error } = await supabase
    .from("equipment_logs")
    .select("*")
    .eq("kit_id", kitId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { data: null, error: error.message };

  const logs: (EquipmentLog & { user_name: string })[] = [];
  for (const log of rawLogs ?? []) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", log.user_id)
      .single();
    logs.push({ ...log, user_name: profile?.name ?? "Unknown" });
  }

  return { data: logs, error: null };
}

// ============================================================
// Inventory CRUD
// ============================================================

export async function getInventoryItems(): Promise<{
  data: InventoryItem[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("equipment_inventory")
    .select("*")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as InventoryItem[], error: null };
}

export async function createInventoryItem(
  input: CreateInventoryItemInput
): Promise<{ data: InventoryItem | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("equipment_inventory")
    .insert({
      name: input.name.trim(),
      sport: input.sport,
      quantity: input.quantity,
      condition: input.condition,
      location: input.location,
      notes: input.notes,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "inventory_item_created",
    entity_type: "equipment_inventory",
    entity_id: data.id,
    metadata: { name: input.name },
  });

  return { data: data as InventoryItem, error: null };
}

export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.sport !== undefined) updates.sport = input.sport;
  if (input.quantity !== undefined) updates.quantity = input.quantity;
  if (input.condition !== undefined) updates.condition = input.condition;
  if (input.location !== undefined) updates.location = input.location;
  if (input.notes !== undefined) updates.notes = input.notes;

  const { error } = await supabase
    .from("equipment_inventory")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "inventory_item_updated",
    entity_type: "equipment_inventory",
    entity_id: id,
    metadata: updates,
  });

  return { error: null };
}

export async function deleteInventoryItem(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("equipment_inventory")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "inventory_item_deleted",
    entity_type: "equipment_inventory",
    entity_id: id,
  });

  return { error: null };
}
