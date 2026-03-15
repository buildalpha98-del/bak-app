import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookingChildEntry } from "@/lib/types/database";

// ============================================================
// Attendance linking: connect bookable session bookings to
// roster session attendance records after session completion
// ============================================================

/**
 * After a roster session is completed, check if it's linked to a
 * bookable_session and update booking attendance accordingly.
 * Called from the session completion flow.
 */
export async function linkAttendanceToBookings(
  rosterSessionId: string
): Promise<{ noShows: string[]; error: string | null }> {
  const admin = createSupabaseAdmin();

  try {
    // 1. Find the bookable_session linked to this roster session
    const { data: bookableSession, error: bsError } = await admin
      .from("bookable_sessions")
      .select("id")
      .eq("session_id", rosterSessionId)
      .single();

    if (bsError || !bookableSession) {
      // No bookable session linked — nothing to do
      return { noShows: [], error: null };
    }

    // 2. Get all confirmed bookings for this bookable session
    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select("id, children_json, parent_id")
      .eq("bookable_session_id", bookableSession.id)
      .eq("status", "confirmed");

    if (bookingsError || !bookings || bookings.length === 0) {
      return { noShows: [], error: null };
    }

    // 3. Get all attendance records for this roster session
    const { data: attendanceRecords, error: attError } = await admin
      .from("session_attendances")
      .select("child_id, present")
      .eq("session_id", rosterSessionId);

    if (attError) {
      return { noShows: [], error: attError.message };
    }

    const attendanceMap = new Map(
      (attendanceRecords ?? []).map((r) => [r.child_id, r.present])
    );

    const noShowBookingIds: string[] = [];

    // 4. For each booking, check if children attended
    for (const booking of bookings) {
      const children = booking.children_json as BookingChildEntry[];
      const allAbsent = children.every((c) => {
        const attended = attendanceMap.get(c.child_id);
        // If no attendance record, treat as absent (no-show)
        return attended === false || attended === undefined;
      });

      if (allAbsent && attendanceRecords && attendanceRecords.length > 0) {
        // All children from this booking were absent — mark as no_show
        await admin
          .from("bookings")
          .update({ status: "no_show" })
          .eq("id", booking.id);

        noShowBookingIds.push(booking.id);
      }
    }

    return { noShows: noShowBookingIds, error: null };
  } catch (err) {
    console.error("linkAttendanceToBookings error:", err);
    return { noShows: [], error: "Failed to link attendance to bookings." };
  }
}

/**
 * Get no-show statistics per parent for admin reporting.
 */
export async function getParentNoShowStats(): Promise<{
  data: Array<{
    parent_id: string;
    parent_name: string;
    parent_email: string;
    total_bookings: number;
    no_shows: number;
    no_show_rate: number;
    flagged: boolean;
  }>;
  error: string | null;
}> {
  const admin = createSupabaseAdmin();

  try {
    // Get all bookings grouped by parent
    const { data: bookings, error } = await admin
      .from("bookings")
      .select("parent_id, status");

    if (error) return { data: [], error: error.message };

    // Group by parent
    const parentStats = new Map<
      string,
      { total: number; noShows: number }
    >();

    for (const booking of bookings ?? []) {
      const stats = parentStats.get(booking.parent_id) || {
        total: 0,
        noShows: 0,
      };
      stats.total++;
      if (booking.status === "no_show") stats.noShows++;
      parentStats.set(booking.parent_id, stats);
    }

    // Get parent names
    const parentIds = Array.from(parentStats.keys());
    if (parentIds.length === 0) return { data: [], error: null };

    const { data: profiles } = await admin
      .from("parent_profiles")
      .select("id, first_name, last_name, email")
      .in("id", parentIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        { name: `${p.first_name} ${p.last_name}`, email: p.email },
      ])
    );

    const results = Array.from(parentStats.entries())
      .map(([parentId, stats]) => {
        const profile = profileMap.get(parentId);
        const rate = stats.total > 0 ? stats.noShows / stats.total : 0;
        return {
          parent_id: parentId,
          parent_name: profile?.name ?? "Unknown",
          parent_email: profile?.email ?? "",
          total_bookings: stats.total,
          no_shows: stats.noShows,
          no_show_rate: Math.round(rate * 100),
          flagged: rate > 0.3 && stats.total >= 5,
        };
      })
      .filter((r) => r.no_shows > 0)
      .sort((a, b) => b.no_show_rate - a.no_show_rate);

    return { data: results, error: null };
  } catch (err) {
    console.error("getParentNoShowStats error:", err);
    return { data: [], error: "Failed to get no-show stats." };
  }
}
