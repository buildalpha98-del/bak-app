"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SearchResult {
  id: string;
  type: "staff" | "centre" | "child";
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearch(
  query: string,
  role: string
): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  const supabase = await createSupabaseServerClient();
  const results: SearchResult[] = [];
  const pattern = `%${query}%`;

  // Only admin and ops can search
  if (role !== "admin" && role !== "ops") return [];

  // Search profiles (staff)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .or(`name.ilike.${pattern},email.ilike.${pattern}`)
    .limit(5);

  if (profiles) {
    for (const p of profiles) {
      results.push({
        id: p.id,
        type: "staff",
        title: p.name || p.email,
        subtitle: `${p.role} · ${p.email}`,
        href: `/${role}/staff/${p.id}`,
      });
    }
  }

  // Search centres
  const { data: centres } = await supabase
    .from("centres")
    .select("id, name, suburb, contract_status")
    .or(`name.ilike.${pattern},suburb.ilike.${pattern}`)
    .limit(5);

  if (centres) {
    for (const c of centres) {
      results.push({
        id: c.id,
        type: "centre",
        title: c.name,
        subtitle: [c.suburb, c.contract_status].filter(Boolean).join(" · "),
        href: `/${role}/centres/${c.id}`,
      });
    }
  }

  // Search children
  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, date_of_birth")
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .limit(5);

  if (children) {
    for (const ch of children) {
      results.push({
        id: ch.id,
        type: "child",
        title: `${ch.first_name} ${ch.last_name}`,
        subtitle: ch.date_of_birth
          ? `DOB: ${new Date(ch.date_of_birth).toLocaleDateString("en-AU")}`
          : "",
        href: `/${role}/children/${ch.id}`,
      });
    }
  }

  return results;
}
