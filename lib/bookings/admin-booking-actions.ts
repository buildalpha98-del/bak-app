"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Booking,
  BookableSession,
  PackageBalance,
  Package,
  Payment,
  ParentProfile,
  BookingChildEntry,
} from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface AdminBookingSummary {
  bookingsThisWeek: number;
  revenueThisWeek: number;
  sessionsWithCapacity: number;
  activeWaitlist: number;
}

export interface AdminBookingRow {
  id: string;
  parent_name: string;
  children: BookingChildEntry[];
  session_title: string;
  session_date: string;
  payment_type: string;
  total_cents: number;
  status: string;
  booked_at: string;
}

export interface AdminBookingFilters {
  session_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  payment_type?: string;
}

export interface AdminPackageBalanceRow {
  id: string;
  parent_name: string;
  package_name: string;
  remaining_sessions: number;
  total_sessions: number;
  expires_at: string;
  status: string;
}

export interface AdminRevenueBreakdown {
  totalRevenue: number;
  singleBookingRevenue: number;
  packagePurchaseRevenue: number;
  bySessionType: { name: string; revenue: number }[];
  bySuburb: { name: string; revenue: number }[];
  bySport: { name: string; revenue: number }[];
}

// ============================================================
// Helpers
// ============================================================

function getStartOfWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

async function verifyAdminOrOps(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "ops"].includes(profile.role)) {
    throw new Error("Insufficient permissions.");
  }

  return user;
}

// ============================================================
// 1. Admin booking summary (dashboard cards)
// ============================================================

export async function getAdminBookingSummary(): Promise<{
  data: AdminBookingSummary | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    const weekStart = getStartOfWeek();

    // Bookings this week
    const { count: bookingsThisWeek } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("booked_at", weekStart);

    // Revenue this week (confirmed bookings)
    const { data: revenueData } = await supabase
      .from("bookings")
      .select("total_cents")
      .eq("status", "confirmed")
      .gte("booked_at", weekStart);

    const revenueThisWeek = (revenueData ?? []).reduce(
      (sum, b) => sum + (b.total_cents ?? 0),
      0
    );

    // Sessions with capacity
    const { count: sessionsWithCapacity } = await supabase
      .from("bookable_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gt("max_capacity", 0)
      .not("current_bookings", "gte", "max_capacity" as unknown as number);

    // For sessions with capacity, we need a different approach since
    // Supabase doesn't support column-to-column comparison directly
    const { data: openSessions } = await supabase
      .from("bookable_sessions")
      .select("id, max_capacity, current_bookings")
      .eq("status", "open");

    const sessionsWithCapacityCount = (openSessions ?? []).filter(
      (s) => s.current_bookings < s.max_capacity
    ).length;

    // Active waitlist
    const { count: activeWaitlist } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true })
      .in("status", ["waiting", "offered"]);

    return {
      data: {
        bookingsThisWeek: bookingsThisWeek ?? 0,
        revenueThisWeek,
        sessionsWithCapacity: sessionsWithCapacityCount,
        activeWaitlist: activeWaitlist ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("getAdminBookingSummary error:", err);
    return { data: null, error: (err as Error).message ?? "Failed to load summary." };
  }
}

// ============================================================
// 2. Admin bookings list (with parent name + session title)
// ============================================================

export async function getAdminBookingsList(
  filters?: AdminBookingFilters
): Promise<{ data: AdminBookingRow[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    let query = supabase
      .from("bookings")
      .select("*, bookable_sessions(title, date), parent_profiles(first_name, last_name)")
      .order("booked_at", { ascending: false });

    if (filters?.session_id) {
      query = query.eq("bookable_session_id", filters.session_id);
    }
    if (filters?.date_from) {
      query = query.gte("booked_at", filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte("booked_at", filters.date_to + "T23:59:59");
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.payment_type) {
      query = query.eq("payment_type", filters.payment_type);
    }

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };

    const rows: AdminBookingRow[] = (data ?? []).map((b: Record<string, unknown>) => {
      const session = b.bookable_sessions as { title: string; date: string } | null;
      const parent = b.parent_profiles as { first_name: string; last_name: string } | null;

      return {
        id: b.id as string,
        parent_name: parent ? `${parent.first_name} ${parent.last_name}` : "Unknown",
        children: (b.children_json as BookingChildEntry[]) ?? [],
        session_title: session?.title ?? "Unknown",
        session_date: session?.date ?? "",
        payment_type: b.payment_type as string,
        total_cents: b.total_cents as number,
        status: b.status as string,
        booked_at: b.booked_at as string,
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    console.error("getAdminBookingsList error:", err);
    return { data: [], error: (err as Error).message ?? "Failed to load bookings." };
  }
}

// ============================================================
// 3. Admin sessions list (with revenue per session)
// ============================================================

export interface AdminSessionRow {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  sport: string | null;
  suburb: string;
  max_capacity: number;
  current_bookings: number;
  price_cents: number;
  status: string;
  revenue: number;
}

export async function getAdminSessionsList(): Promise<{
  data: AdminSessionRow[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    const { data: sessions, error: sessionsError } = await supabase
      .from("bookable_sessions")
      .select("*")
      .order("date", { ascending: false })
      .order("start_time", { ascending: true });

    if (sessionsError) return { data: [], error: sessionsError.message };

    // Get revenue per session
    const { data: bookings } = await supabase
      .from("bookings")
      .select("bookable_session_id, total_cents")
      .eq("status", "confirmed");

    const revenueMap: Record<string, number> = {};
    (bookings ?? []).forEach((b) => {
      revenueMap[b.bookable_session_id] = (revenueMap[b.bookable_session_id] ?? 0) + b.total_cents;
    });

    const rows: AdminSessionRow[] = (sessions ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      session_type: s.session_type,
      sport: s.sport,
      suburb: s.suburb,
      max_capacity: s.max_capacity,
      current_bookings: s.current_bookings,
      price_cents: s.price_cents,
      status: s.status,
      revenue: revenueMap[s.id] ?? 0,
    }));

    return { data: rows, error: null };
  } catch (err) {
    console.error("getAdminSessionsList error:", err);
    return { data: [], error: (err as Error).message ?? "Failed to load sessions." };
  }
}

// ============================================================
// 4. Admin package balances
// ============================================================

export interface AdminPackageSummary {
  balances: AdminPackageBalanceRow[];
  totalPackageRevenue: number;
  mostPopularPackage: string | null;
}

export async function getAdminPackageBalances(): Promise<{
  data: AdminPackageSummary | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    // Package balances with parent + package details
    const { data: balances, error: balancesError } = await supabase
      .from("package_balances")
      .select("*, parent_profiles(first_name, last_name), packages(name)")
      .order("created_at", { ascending: false });

    if (balancesError) return { data: null, error: balancesError.message };

    const rows: AdminPackageBalanceRow[] = (balances ?? []).map((b: Record<string, unknown>) => {
      const parent = b.parent_profiles as { first_name: string; last_name: string } | null;
      const pkg = b.packages as { name: string } | null;

      return {
        id: b.id as string,
        parent_name: parent ? `${parent.first_name} ${parent.last_name}` : "Unknown",
        package_name: pkg?.name ?? "Unknown",
        remaining_sessions: b.remaining_sessions as number,
        total_sessions: b.total_sessions as number,
        expires_at: b.expires_at as string,
        status: b.status as string,
      };
    });

    // Total package revenue
    const { data: packagePayments } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("payment_type", "package_purchase")
      .eq("status", "completed");

    const totalPackageRevenue = (packagePayments ?? []).reduce(
      (sum, p) => sum + (p.amount_cents ?? 0),
      0
    );

    // Most popular package (highest count of package_balances)
    const packageCounts: Record<string, { name: string; count: number }> = {};
    (balances ?? []).forEach((b: Record<string, unknown>) => {
      const pkgId = b.package_id as string;
      const pkg = b.packages as { name: string } | null;
      if (!packageCounts[pkgId]) {
        packageCounts[pkgId] = { name: pkg?.name ?? "Unknown", count: 0 };
      }
      packageCounts[pkgId].count++;
    });

    const sortedPackages = Object.values(packageCounts).sort((a, b) => b.count - a.count);
    const mostPopularPackage = sortedPackages.length > 0 ? sortedPackages[0].name : null;

    return {
      data: {
        balances: rows,
        totalPackageRevenue,
        mostPopularPackage,
      },
      error: null,
    };
  } catch (err) {
    console.error("getAdminPackageBalances error:", err);
    return { data: null, error: (err as Error).message ?? "Failed to load package balances." };
  }
}

// ============================================================
// 5. Admin revenue breakdown
// ============================================================

export async function getAdminRevenueBreakdown(): Promise<{
  data: AdminRevenueBreakdown | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    // All confirmed booking revenue
    const { data: confirmedBookings } = await supabase
      .from("bookings")
      .select("total_cents, payment_type, bookable_session_id")
      .eq("status", "confirmed");

    const singleBookingRevenue = (confirmedBookings ?? [])
      .filter((b) => b.payment_type === "single_payment")
      .reduce((sum, b) => sum + (b.total_cents ?? 0), 0);

    // Package purchase revenue (from payments table)
    const { data: packagePayments } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("payment_type", "package_purchase")
      .eq("status", "completed");

    const packagePurchaseRevenue = (packagePayments ?? []).reduce(
      (sum, p) => sum + (p.amount_cents ?? 0),
      0
    );

    const totalRevenue = singleBookingRevenue + packagePurchaseRevenue;

    // Get bookable sessions for grouping
    const sessionIds = [
      ...new Set((confirmedBookings ?? []).map((b) => b.bookable_session_id)),
    ];

    const { data: sessions } = await supabase
      .from("bookable_sessions")
      .select("id, session_type, suburb, sport")
      .in("id", sessionIds.length > 0 ? sessionIds : ["none"]);

    const sessionMap: Record<string, { session_type: string; suburb: string; sport: string | null }> = {};
    (sessions ?? []).forEach((s) => {
      sessionMap[s.id] = { session_type: s.session_type, suburb: s.suburb, sport: s.sport };
    });

    // Revenue by session type
    const bySessionTypeMap: Record<string, number> = {};
    const bySuburbMap: Record<string, number> = {};
    const bySportMap: Record<string, number> = {};

    (confirmedBookings ?? []).forEach((b) => {
      const session = sessionMap[b.bookable_session_id];
      if (!session) return;

      const type = session.session_type ?? "other";
      bySessionTypeMap[type] = (bySessionTypeMap[type] ?? 0) + b.total_cents;

      const suburb = session.suburb ?? "Unknown";
      bySuburbMap[suburb] = (bySuburbMap[suburb] ?? 0) + b.total_cents;

      const sport = session.sport ?? "Unspecified";
      bySportMap[sport] = (bySportMap[sport] ?? 0) + b.total_cents;
    });

    const bySessionType = Object.entries(bySessionTypeMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const bySuburb = Object.entries(bySuburbMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const bySport = Object.entries(bySportMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      data: {
        totalRevenue,
        singleBookingRevenue,
        packagePurchaseRevenue,
        bySessionType,
        bySuburb,
        bySport,
      },
      error: null,
    };
  } catch (err) {
    console.error("getAdminRevenueBreakdown error:", err);
    return { data: null, error: (err as Error).message ?? "Failed to load revenue data." };
  }
}

// ============================================================
// 6. Export bookings CSV
// ============================================================

export async function exportBookingsCSV(
  filters?: AdminBookingFilters
): Promise<{ data: string | null; error: string | null }> {
  try {
    const { data: bookings, error } = await getAdminBookingsList(filters);

    if (error) return { data: null, error };

    const headers = [
      "Booking ID",
      "Parent Name",
      "Children",
      "Session Title",
      "Session Date",
      "Payment Type",
      "Total ($)",
      "Status",
      "Booked At",
    ];

    const rows = bookings.map((b) => [
      b.id,
      b.parent_name,
      b.children.map((c) => c.child_name).join("; "),
      b.session_title,
      b.session_date,
      b.payment_type === "single_payment" ? "Single" : "Package",
      (b.total_cents / 100).toFixed(2),
      b.status,
      new Date(b.booked_at).toLocaleDateString("en-AU"),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return { data: csv, error: null };
  } catch (err) {
    console.error("exportBookingsCSV error:", err);
    return { data: null, error: "Failed to export bookings." };
  }
}

// ============================================================
// 7. Toggle session status (open/close)
// ============================================================

export async function toggleSessionStatus(
  sessionId: string,
  currentStatus: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    const newStatus = currentStatus === "open" ? "closed" : "open";

    const { error } = await supabase
      .from("bookable_sessions")
      .update({ status: newStatus })
      .eq("id", sessionId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("toggleSessionStatus error:", err);
    return { error: "Failed to toggle session status." };
  }
}

// ============================================================
// 8. Get all bookable sessions (for filter dropdowns)
// ============================================================

export async function getSessionsForDropdown(): Promise<{
  data: { id: string; title: string; date: string }[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    await verifyAdminOrOps(supabase);

    const { data, error } = await supabase
      .from("bookable_sessions")
      .select("id, title, date")
      .order("date", { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getSessionsForDropdown error:", err);
    return { data: [], error: "Failed to load sessions." };
  }
}

// ============================================================
// 9. Bulk admin-gated actions
// ============================================================
//
// Each action gates to admin/ops via the role check pattern in
// `verifyAdminOrOps`. Updates are applied per-id so a bad row doesn't
// sink the whole batch; we capture per-id errors and continue. Activity
// log gets one row per successful update so the audit trail stays
// granular.
//
// State transitions are guarded server-side:
//   - bulkCancelBookings: only `confirmed` or `pending_payment` rows
//     flip to `cancelled`. Anything already cancelled/refunded is
//     silently skipped (counts toward the "skipped" total).
//   - bulkActivateSessions: only `draft` or `closed` rows flip to
//     `open`. Anything already open/cancelled/completed is skipped.
//   - bulkPublishSessions: a narrower alias — only `draft` → `open`,
//     mirroring the publish-week UX vocabulary on the roster grid.

async function gateAdminOrOps(): Promise<
  | { ok: true; userId: string; role: "admin" | "ops" }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "ops")
  ) {
    return { ok: false, error: "Insufficient permissions." };
  }

  return {
    ok: true,
    userId: user.id,
    role: profile.role as "admin" | "ops",
  };
}

/**
 * Bulk-cancel N bookings. Only `confirmed` or `pending_payment` rows
 * flip to `cancelled`; anything else is skipped. Returns the count of
 * successful updates and a first-error message if something went
 * wrong; per-id failures are aggregated into `error`.
 */
export async function bulkCancelBookings(
  bookingIds: string[],
  reason: string
): Promise<{ updated: number; error: string | null }> {
  if (!bookingIds.length) {
    return { updated: 0, error: "No bookings selected." };
  }
  const gate = await gateAdminOrOps();
  if (!gate.ok) return { updated: 0, error: gate.error };

  try {
    const supabase = await createSupabaseServerClient();
    let updated = 0;
    const errors: string[] = [];

    // Load current statuses so we only flip eligible rows. A guard
    // up-front keeps the activity-log entries truthful.
    const { data: existing, error: readErr } = await supabase
      .from("bookings")
      .select("id, status")
      .in("id", bookingIds);
    if (readErr) return { updated: 0, error: readErr.message };

    const eligible = (existing ?? []).filter((b: { status: string }) =>
      ["confirmed", "pending_payment"].includes(b.status)
    );

    for (const row of eligible as Array<{ id: string }>) {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      if (error) {
        errors.push(error.message);
        continue;
      }
      updated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "booking_bulk_cancelled",
        entity_type: "booking",
        entity_id: row.id,
        metadata: { reason: reason?.trim() || null },
      });
    }

    return {
      updated,
      error: errors.length ? errors[0] : null,
    };
  } catch (err) {
    console.error("bulkCancelBookings error:", err);
    return { updated: 0, error: (err as Error).message ?? "Failed to cancel bookings." };
  }
}

/**
 * Bulk-activate (open) N bookable_sessions. Only `draft` or `closed`
 * rows flip to `open`; anything else is skipped.
 */
export async function bulkActivateSessions(
  sessionIds: string[]
): Promise<{ updated: number; error: string | null }> {
  if (!sessionIds.length) {
    return { updated: 0, error: "No sessions selected." };
  }
  const gate = await gateAdminOrOps();
  if (!gate.ok) return { updated: 0, error: gate.error };

  try {
    const supabase = await createSupabaseServerClient();
    let updated = 0;
    const errors: string[] = [];

    const { data: existing, error: readErr } = await supabase
      .from("bookable_sessions")
      .select("id, status")
      .in("id", sessionIds);
    if (readErr) return { updated: 0, error: readErr.message };

    const eligible = (existing ?? []).filter((s: { status: string }) =>
      ["draft", "closed"].includes(s.status)
    );

    for (const row of eligible as Array<{ id: string }>) {
      const { error } = await supabase
        .from("bookable_sessions")
        .update({ status: "open" })
        .eq("id", row.id);
      if (error) {
        errors.push(error.message);
        continue;
      }
      updated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "bookable_session_bulk_activated",
        entity_type: "bookable_session",
        entity_id: row.id,
      });
    }

    return {
      updated,
      error: errors.length ? errors[0] : null,
    };
  } catch (err) {
    console.error("bulkActivateSessions error:", err);
    return { updated: 0, error: (err as Error).message ?? "Failed to activate sessions." };
  }
}

/**
 * Bulk-publish (draft → open) N bookable_sessions. Narrower than
 * activate — used when the operator explicitly wants to ship drafts
 * without touching any "closed" rows. Keeps the audit trail clearer
 * for the publish-week vocabulary.
 */
export async function bulkPublishSessions(
  sessionIds: string[]
): Promise<{ updated: number; error: string | null }> {
  if (!sessionIds.length) {
    return { updated: 0, error: "No sessions selected." };
  }
  const gate = await gateAdminOrOps();
  if (!gate.ok) return { updated: 0, error: gate.error };

  try {
    const supabase = await createSupabaseServerClient();
    let updated = 0;
    const errors: string[] = [];

    const { data: existing, error: readErr } = await supabase
      .from("bookable_sessions")
      .select("id, status")
      .in("id", sessionIds);
    if (readErr) return { updated: 0, error: readErr.message };

    const eligible = (existing ?? []).filter(
      (s: { status: string }) => s.status === "draft"
    );

    for (const row of eligible as Array<{ id: string }>) {
      const { error } = await supabase
        .from("bookable_sessions")
        .update({ status: "open" })
        .eq("id", row.id);
      if (error) {
        errors.push(error.message);
        continue;
      }
      updated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "bookable_session_bulk_published",
        entity_type: "bookable_session",
        entity_id: row.id,
      });
    }

    return {
      updated,
      error: errors.length ? errors[0] : null,
    };
  } catch (err) {
    console.error("bulkPublishSessions error:", err);
    return { updated: 0, error: (err as Error).message ?? "Failed to publish sessions." };
  }
}
