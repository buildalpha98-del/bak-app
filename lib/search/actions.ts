"use server";

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/enums";

// ============================================================
// Result types — flat shape so the client doesn't need to know
// table internals to render a row.
// ============================================================
export type SearchResultType =
  | "centre"
  | "staff"
  | "lead"
  | "child"
  | "session"
  | "program"
  | "document";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  url: string;
  /** Icon hint resolved client-side by name (keyof IconMap). */
  icon: SearchResultType;
}

export interface GlobalSearchOpts {
  /** Role to scope results by. Falls back to the caller's session role. */
  roleScope?: UserRole;
  /** Hard cap on total results across all entity types. Default 30. */
  limit?: number;
}

// Entities per-type cap. Total results across all types are capped by `limit`.
const PER_ENTITY_LIMIT = 5;
const DEFAULT_TOTAL_LIMIT = 30;

// Roles that may search globally. Coach gets a narrowed slice; client/parent
// don't search at all (they live in single-centre scopes).
const SEARCHABLE_ROLES: ReadonlyArray<UserRole> = ["admin", "ops", "coach"];

// ============================================================
// Internal helpers
// ============================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeForOr(value: string): string {
  // Supabase .or() treats comma + parens as separators; sanitise both.
  return value.replace(/[,()]/g, " ").trim();
}

/**
 * Rank a single hit against the raw query so exact > starts-with > contains.
 * Returns a smaller number for better matches (sorts ascending).
 */
function rank(value: string | null | undefined, query: string): number {
  if (!value) return 99;
  const v = value.toLowerCase();
  const q = query.toLowerCase();
  if (v === q) return 0;
  if (v.startsWith(q)) return 1;
  if (v.includes(q)) return 2;
  return 3;
}

/**
 * Build the per-result base href for entities that have role-aware routes.
 * Coach has read-only views for own records — they never reach
 * /admin/* or /ops/*, so we always send them to the coach surface even
 * if a row leaks through. Centres + sessions for coaches go to
 * /coach/centres/<id> and /coach/schedule respectively.
 */
function adminOrOpsPrefix(viewer: UserRole): "admin" | "ops" {
  return viewer === "admin" ? "admin" : "ops";
}

// ============================================================
// globalSearch — fan-out across 7 entity types
// ============================================================

export async function globalSearch(
  query: string,
  optsOrRole?: GlobalSearchOpts | UserRole
): Promise<SearchResult[]> {
  const trimmed = (query ?? "").trim();
  if (trimmed.length < 2) return [];

  // Back-compat: the original signature accepted a bare role string.
  const opts: GlobalSearchOpts =
    typeof optsOrRole === "string"
      ? { roleScope: optsOrRole }
      : optsOrRole ?? {};

  const totalLimit = Math.max(1, opts.limit ?? DEFAULT_TOTAL_LIMIT);

  const supabase = await createSupabaseServerClient();

  // Auth gate — no session means no results regardless of caller intent.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Resolve viewer role. Prefer the caller-provided scope (server components
  // already loaded the profile); otherwise look it up.
  let viewer: UserRole | null = opts.roleScope ?? null;
  if (!viewer) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    viewer = (profile?.role as UserRole | undefined) ?? null;
  }

  if (!viewer || !SEARCHABLE_ROLES.includes(viewer)) {
    return [];
  }

  const safe = escapeForOr(trimmed);
  if (!safe) return [];
  const pattern = `%${safe}%`;
  const prefix = adminOrOpsPrefix(viewer);
  const isPrivileged = viewer === "admin" || viewer === "ops";

  // Detect ISO date in the query for session lookup.
  const dateMatch = trimmed.match(ISO_DATE_RE)?.[0] ?? null;

  // ------------------------------------------------------------
  // Per-entity searches — fan out in parallel
  // ------------------------------------------------------------

  const centresPromise = isPrivileged
    ? supabase
        .from("centres")
        .select("id, name, address, type, contract_status")
        .or(`name.ilike.${pattern},address.ilike.${pattern}`)
        .limit(PER_ENTITY_LIMIT)
    : Promise.resolve({ data: null, error: null });

  // Coaches don't search staff (no use case + privacy on email).
  const staffPromise = isPrivileged
    ? supabase
        .from("profiles")
        .select("id, name, email, role, status")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(PER_ENTITY_LIMIT)
    : Promise.resolve({ data: null, error: null });

  const leadsPromise = isPrivileged
    ? supabase
        .from("leads")
        .select("id, centre_name, contact_name, contact_email, stage")
        .or(
          `centre_name.ilike.${pattern},contact_name.ilike.${pattern},contact_email.ilike.${pattern}`
        )
        .limit(PER_ENTITY_LIMIT)
    : Promise.resolve({ data: null, error: null });

  // Children: admin/ops see all; coaches only see kids assigned to a
  // session they're rostered on. We restrict by `created_at` ordering
  // for stability; the per-row RLS will block leakage at the DB level.
  const childrenPromise = isPrivileged
    ? supabase
        .from("children")
        .select("id, first_name, last_name, date_of_birth")
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .limit(PER_ENTITY_LIMIT)
    : // Coach branch: rely on RLS — same query returns only authorised rows.
      supabase
        .from("children")
        .select("id, first_name, last_name, date_of_birth")
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .limit(PER_ENTITY_LIMIT);

  // Sessions: search by ISO date OR by centre name (joined). For coaches,
  // restrict to sessions where they're rostered.
  const sessionsPromise = (async () => {
    let q = supabase
      .from("sessions")
      .select("id, date, time, sport, centre_id, centres!inner(name)")
      .limit(PER_ENTITY_LIMIT);

    if (dateMatch) {
      q = q.eq("date", dateMatch);
    } else {
      q = q.ilike("centres.name", pattern);
    }

    if (viewer === "coach") {
      q = q.eq("coach_id", user.id);
    }
    return q;
  })();

  // Programs: search title / sport / skill_focus. Coaches can see programs
  // (they reference them when delivering sessions).
  const programsPromise = supabase
    .from("programs")
    .select("id, sport, skill_focus, age_group, content_json")
    .or(`sport.ilike.${pattern},skill_focus.ilike.${pattern}`)
    .limit(PER_ENTITY_LIMIT);

  // Documents: search title + file_name. Coach gets only docs visible to
  // their role via RLS.
  const documentsPromise = supabase
    .from("documents")
    .select("id, title, file_name, category, visibility")
    .or(`title.ilike.${pattern},file_name.ilike.${pattern}`)
    .limit(PER_ENTITY_LIMIT);

  const [
    centresRes,
    staffRes,
    leadsRes,
    childrenRes,
    sessionsRes,
    programsRes,
    documentsRes,
  ] = await Promise.all([
    centresPromise,
    staffPromise,
    leadsPromise,
    childrenPromise,
    sessionsPromise,
    programsPromise,
    documentsPromise,
  ]);

  const results: SearchResult[] = [];

  // ------------------------------------------------------------
  // Map rows -> SearchResult shape
  // ------------------------------------------------------------

  for (const c of centresRes?.data ?? []) {
    const centre = c as {
      id: string;
      name: string | null;
      address: string | null;
      type: string | null;
      contract_status: string | null;
    };
    results.push({
      id: centre.id,
      type: "centre",
      title: centre.name ?? "Untitled centre",
      subtitle:
        [centre.address, centre.contract_status].filter(Boolean).join(" · ") ||
        "Centre",
      url: `/${prefix}/centres/${centre.id}`,
      icon: "centre",
    });
  }

  for (const s of staffRes?.data ?? []) {
    const staff = s as {
      id: string;
      name: string | null;
      email: string | null;
      role: string | null;
      status: string | null;
    };
    results.push({
      id: staff.id,
      type: "staff",
      title: staff.name ?? staff.email ?? "Unknown staff",
      subtitle:
        [staff.role, staff.email].filter(Boolean).join(" · ") || "Staff",
      url: `/${prefix}/staff/${staff.id}`,
      icon: "staff",
    });
  }

  for (const l of leadsRes?.data ?? []) {
    const lead = l as {
      id: string;
      centre_name: string | null;
      contact_name: string | null;
      contact_email: string | null;
      stage: string | null;
    };
    results.push({
      id: lead.id,
      type: "lead",
      title: lead.centre_name ?? lead.contact_name ?? "Lead",
      subtitle:
        [lead.contact_name, lead.stage].filter(Boolean).join(" · ") ||
        "Lead",
      url: `/${prefix}/crm/${lead.id}`,
      icon: "lead",
    });
  }

  for (const ch of childrenRes?.data ?? []) {
    const child = ch as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      date_of_birth: string | null;
    };
    const full = `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim();
    // Coaches never get a children detail page; route them to roster.
    const childUrl =
      viewer === "coach"
        ? `/coach/schedule`
        : `/${prefix}/children/${child.id}`;
    results.push({
      id: child.id,
      type: "child",
      title: full || "Unnamed child",
      subtitle: child.date_of_birth
        ? `DOB ${new Date(child.date_of_birth).toLocaleDateString("en-AU")}`
        : "Child record",
      url: childUrl,
      icon: "child",
    });
  }

  for (const ses of sessionsRes?.data ?? []) {
    const session = ses as {
      id: string;
      date: string;
      time: string | null;
      sport: string | null;
      centre_id: string;
      centres: { name: string | null } | { name: string | null }[] | null;
    };
    const centreName = Array.isArray(session.centres)
      ? session.centres[0]?.name
      : session.centres?.name;
    const week = session.date; // YYYY-MM-DD — roster pages accept ?week=
    const rosterPath =
      viewer === "coach"
        ? `/coach/schedule?week=${week}`
        : `/${prefix}/roster?week=${week}`;
    results.push({
      id: session.id,
      type: "session",
      title: `${session.sport ?? "Session"} · ${centreName ?? "centre"}`,
      subtitle: [session.date, session.time].filter(Boolean).join(" · "),
      url: rosterPath,
      icon: "session",
    });
  }

  for (const p of programsRes?.data ?? []) {
    const program = p as {
      id: string;
      sport: string | null;
      skill_focus: string | null;
      age_group: string | null;
      content_json: Record<string, unknown> | null;
    };
    const titleFromJson =
      program.content_json && typeof program.content_json.title === "string"
        ? (program.content_json.title as string)
        : null;
    const programPrefix =
      viewer === "coach" ? "coach" : prefix;
    // Coaches don't have a program detail route; send them to the programs list.
    const programUrl =
      viewer === "coach"
        ? `/coach/docs`
        : `/${programPrefix}/programs/${program.id}`;
    results.push({
      id: program.id,
      type: "program",
      title:
        titleFromJson ??
        `${program.sport ?? "Program"} · ${program.age_group ?? "all ages"}`,
      subtitle:
        [program.skill_focus, program.age_group]
          .filter(Boolean)
          .join(" · ") || "Program",
      url: programUrl,
      icon: "program",
    });
  }

  for (const d of documentsRes?.data ?? []) {
    const doc = d as {
      id: string;
      title: string | null;
      file_name: string | null;
      category: string | null;
      visibility: string | null;
    };
    const docPrefix = viewer === "coach" ? "coach/docs" : `${prefix}/documents`;
    results.push({
      id: doc.id,
      type: "document",
      title: doc.title ?? doc.file_name ?? "Document",
      subtitle:
        [doc.category, doc.file_name].filter(Boolean).join(" · ") ||
        "Document",
      url: `/${docPrefix}`,
      icon: "document",
    });
  }

  // ------------------------------------------------------------
  // Rank + cap
  // ------------------------------------------------------------

  results.sort((a, b) => {
    const ra = Math.min(rank(a.title, trimmed), rank(a.subtitle, trimmed));
    const rb = Math.min(rank(b.title, trimmed), rank(b.subtitle, trimmed));
    if (ra !== rb) return ra - rb;
    return a.title.localeCompare(b.title);
  });

  return results.slice(0, totalLimit);
}
