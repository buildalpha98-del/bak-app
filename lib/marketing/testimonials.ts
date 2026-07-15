// ============================================================
// Public testimonials — SERVER ONLY
// ============================================================
//
// Mirrors app/api/public/testimonials/route.ts: approved rows only,
// public-safe columns only, most recent first. Uses the
// service-role client, so never import this from a "use client"
// component. Throws on query failure — the homepage wraps the call
// in try/catch and renders nothing rather than breaking.

import { createSupabaseAdmin } from "@/lib/supabase/admin";

export interface PublicTestimonial {
  display_name: string;
  comment: string;
  rating: number;
  centre_name: string;
}

export async function getApprovedTestimonials(
  limit = 4
): Promise<PublicTestimonial[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("approved_testimonials")
    .select("display_name, comment, rating, centre_name")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PublicTestimonial[];
}
