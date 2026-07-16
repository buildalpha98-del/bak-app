// ============================================================
// Public testimonials — SERVER ONLY
// ============================================================
//
// Same source and public-safe columns as
// app/api/public/testimonials/route.ts (approved rows only), but a
// different shape: the route shuffles randomly and caps at 20; this
// returns newest first (created_at desc) capped at `limit`
// (default 4). Uses the service-role client, so never import this
// from a "use client" component. Throws on query failure — the
// homepage guards the call with safeFetch and renders nothing
// rather than breaking.

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
