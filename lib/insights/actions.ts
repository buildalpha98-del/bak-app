"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChildInsight } from "@/lib/types/database";

// ============================================================
// Child Development Insights — Server Actions
// ============================================================

/**
 * List all insights for a child (most recent first).
 */
export async function getChildInsights(
  childId: string
): Promise<{ data: ChildInsight[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("child_insights")
    .select("*")
    .eq("child_id", childId)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data as ChildInsight[], error: null };
}

/**
 * Get a single insight with child data.
 */
export async function getInsight(
  insightId: string
): Promise<{
  data: (ChildInsight & { child: { first_name: string; last_name: string; age_group: string } }) | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("child_insights")
    .select("*, child:children!child_id(first_name, last_name, age_group)")
    .eq("id", insightId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ChildInsight & { child: { first_name: string; last_name: string; age_group: string } }, error: null };
}

/**
 * Generate a new AI insight for a child. Calls the API route internally.
 */
export async function generateChildInsight(
  childId: string,
  termId?: string,
  centreId?: string
): Promise<{ data: ChildInsight | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  // Verify the child exists
  const { data: child, error: childError } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .single();

  if (childError || !child) {
    return { data: null, error: "Child not found" };
  }

  // Call the generate API route
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/insights/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childId, termId, centreId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Failed to generate insight" }));
    return { data: null, error: body.error || "Failed to generate insight" };
  }

  const result = await response.json();
  return { data: result.data as ChildInsight, error: null };
}

/**
 * Get all insights for children at a specific centre, optionally filtered by term.
 */
export async function getInsightsForCentre(
  centreId: string,
  termId?: string
): Promise<{ data: (ChildInsight & { child: { first_name: string; last_name: string } })[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("child_insights")
    .select("*, child:children!child_id(first_name, last_name)")
    .eq("centre_id", centreId)
    .order("created_at", { ascending: false });

  if (termId) {
    query = query.eq("term_id", termId);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: data as (ChildInsight & { child: { first_name: string; last_name: string } })[],
    error: null,
  };
}

/**
 * Get insights for the authenticated parent's children.
 */
export async function getInsightsForParent(): Promise<{
  data: (ChildInsight & { child: { first_name: string; last_name: string } })[];
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: "Not authenticated" };
  }

  // Get parent profile
  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!parentProfile) {
    return { data: [], error: "Parent profile not found" };
  }

  // Get the parent's children IDs
  const { data: parentChildren } = await supabase
    .from("parent_children")
    .select("child_id")
    .eq("parent_id", parentProfile.id);

  if (!parentChildren || parentChildren.length === 0) {
    return { data: [], error: null };
  }

  const childIds = parentChildren.map((pc) => pc.child_id);

  // Fetch insights for all children
  const { data, error } = await supabase
    .from("child_insights")
    .select("*, child:children!child_id(first_name, last_name)")
    .in("child_id", childIds)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: data as (ChildInsight & { child: { first_name: string; last_name: string } })[],
    error: null,
  };
}
