"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Payment } from "@/lib/types/database";

export async function getParentPayments(): Promise<{
  data: Payment[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: [], error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { data: [], error: "No parent profile." };

    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("parent_id", parentProfile.id)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getParentPayments error:", err);
    return { data: [], error: "Failed to load payments." };
  }
}
