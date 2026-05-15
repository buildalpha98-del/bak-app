"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SPORTS } from "@/lib/types/enums";

const PRESET_SPORTS_LOWER = new Set<string>(SPORTS.map((s) => s.toLowerCase()));

function nameCollidesWithPreset(name: string): boolean {
  return PRESET_SPORTS_LOWER.has(name.toLowerCase());
}

// ============================================================
// Types
// ============================================================

export interface CustomTaxonomyItem {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

interface ActionOk<T = void> {
  data: T extends void ? null : T;
  error: null;
}
interface ActionErr {
  data: null;
  error: string;
}
type Action<T = void> = ActionOk<T> | ActionErr;

// ============================================================
// Auth guard — admin/ops only for writes
// ============================================================

async function requireAdminOrOps(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { error: "Only admin or ops can modify custom taxonomy." };
  }
  return { userId: user.id };
}

// ============================================================
// Custom sports
// ============================================================

export async function listCustomSports(): Promise<Action<CustomTaxonomyItem[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_sports")
    .select("id, name, created_by, created_at")
    .order("name");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CustomTaxonomyItem[], error: null };
}

export async function addCustomSport(name: string): Promise<Action<CustomTaxonomyItem>> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };
  if (nameCollidesWithPreset(trimmed)) {
    return { data: null, error: `"${trimmed}" is already a preset sport.` };
  }

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_sports")
    .insert({ name: trimmed, created_by: auth.userId })
    .select("id, name, created_by, created_at")
    .single();
  if (error) {
    // 23505 = unique_violation (case-insensitive index)
    if (error.code === "23505") {
      return { data: null, error: `A sport with the name "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: data as CustomTaxonomyItem, error: null };
}

export async function renameCustomSport(
  id: string,
  newName: string,
): Promise<Action> {
  const trimmed = newName.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };
  if (nameCollidesWithPreset(trimmed)) {
    return { data: null, error: `"${trimmed}" is already a preset sport.` };
  }

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_sports")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { data: null, error: `A sport with the name "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}

export async function deleteCustomSport(id: string): Promise<Action> {
  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("custom_sports").delete().eq("id", id);
  if (error) return { data: null, error: error.message };

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}

// ============================================================
// Custom equipment — same 4 actions, same shape
// ============================================================

export async function listCustomEquipment(): Promise<Action<CustomTaxonomyItem[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_equipment")
    .select("id, name, created_by, created_at")
    .order("name");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CustomTaxonomyItem[], error: null };
}

export async function addCustomEquipment(name: string): Promise<Action<CustomTaxonomyItem>> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_equipment")
    .insert({ name: trimmed, created_by: auth.userId })
    .select("id, name, created_by, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { data: null, error: `Equipment "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: data as CustomTaxonomyItem, error: null };
}

export async function renameCustomEquipment(
  id: string,
  newName: string,
): Promise<Action> {
  const trimmed = newName.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_equipment")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { data: null, error: `Equipment "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}

export async function deleteCustomEquipment(id: string): Promise<Action> {
  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("custom_equipment").delete().eq("id", id);
  if (error) return { data: null, error: error.message };

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}
