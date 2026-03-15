import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Booking,
  BookableSession,
  PackageBalance,
  Package,
  Payment,
  WaitlistEntry,
  BookingChildEntry,
  FeedbackRating,
  ApprovedTestimonial,
  ParentProfile,
} from "@/lib/types/database";
import type {
  BookingStatus,
  BookingPaymentType,
  TestimonialStatus,
} from "@/lib/types/enums";
import { createBooking } from "@/lib/bookings/booking-actions";

// ============================================================
// Types
// ============================================================

interface ParentDashboardData {
  upcomingBookings: (Booking & { session: BookableSession })[];
  packageBalances: (PackageBalance & { package: Package })[];
  totalAttended: number;
  uniqueSports: string[];
  recentSessions: (Booking & { session: BookableSession })[];
}

interface AdminBookingDashboardData {
  totalBookingsThisWeek: number;
  revenueThisWeek: number;
  packageRevenueThisWeek: number;
  upcomingSessions: BookableSession[];
  activeWaitlistCount: number;
  allBookableSessions: (BookableSession & { booking_count: number })[];
}

interface AdminBookingsFilters {
  session_id?: string;
  date_from?: string;
  date_to?: string;
  status?: BookingStatus;
  payment_type?: BookingPaymentType;
}

interface SessionAttendee {
  booking_id: string;
  child_id: string;
  child_name: string;
  age_group: string;
  parent_id: string;
  parent_name: string;
  parent_phone: string | null;
  parent_email: string;
  attendance_status: string | null;
}

interface NoShowParent {
  parent_id: string;
  parent_name: string;
  parent_email: string;
  total_bookings: number;
  no_show_count: number;
  no_show_rate: number;
  flagged: boolean;
}

interface ApproveTestimonialInput {
  feedback_rating_id: string;
  centre_name: string;
  comment: string;
  rating: number;
  display_name: string;
}

interface TestimonialCandidate {
  id: string;
  session_id: string;
  centre_id: string;
  coach_id: string | null;
  sport: string | null;
  rating: number;
  comment: string;
  submitted_at: string | null;
  created_at: string;
  centre_name: string;
  coach_name: string | null;
}

// ============================================================
// 1. Get parent dashboard data
// ============================================================

export async function getParentDashboardData(): Promise<{
  data: ParentDashboardData | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { data: null, error: "No parent profile." };

    const today = new Date().toISOString().split("T")[0];

    // Upcoming confirmed bookings with session details
    const { data: upcomingRaw } = await supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "confirmed")
      .order("booked_at", { ascending: true });

    const upcomingBookings = (upcomingRaw ?? [])
      .filter((b) => {
        const session = (b as Record<string, unknown>)
          .bookable_sessions as unknown as BookableSession;
        return session && session.date >= today;
      })
      .map((b) => ({
        ...b,
        session: (b as Record<string, unknown>)
          .bookable_sessions as unknown as BookableSession,
        bookable_sessions: undefined,
      })) as (Booking & { session: BookableSession })[];

    // Active package balances with package details
    const { data: balancesRaw } = await supabase
      .from("package_balances")
      .select("*, packages(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "active")
      .order("expires_at", { ascending: true });

    const packageBalances = (balancesRaw ?? []).map((b) => ({
      ...b,
      package: (b as Record<string, unknown>)
        .packages as unknown as Package,
      packages: undefined,
    })) as (PackageBalance & { package: Package })[];

    // All bookings with session details for stats
    const { data: allBookingsRaw } = await supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .in("status", ["confirmed", "no_show"])
      .order("booked_at", { ascending: false });

    const allBookings = (allBookingsRaw ?? []).map((b) => ({
      ...b,
      session: (b as Record<string, unknown>)
        .bookable_sessions as unknown as BookableSession,
      bookable_sessions: undefined,
    })) as (Booking & { session: BookableSession })[];

    // Completed sessions (past date)
    const completedBookings = allBookings.filter(
      (b) => b.session && b.session.date < today
    );

    const totalAttended = completedBookings.length;

    // Unique sports from all sessions
    const sportsSet = new Set<string>();
    allBookings.forEach((b) => {
      if (b.session?.sport) {
        sportsSet.add(b.session.sport);
      }
    });
    const uniqueSports = Array.from(sportsSet).sort();

    // Last 3 completed sessions
    const recentSessions = completedBookings.slice(0, 3);

    return {
      data: {
        upcomingBookings,
        packageBalances,
        totalAttended,
        uniqueSports,
        recentSessions,
      },
      error: null,
    };
  } catch (err) {
    console.error("getParentDashboardData error:", err);
    return { data: null, error: "Failed to load dashboard data." };
  }
}

// ============================================================
// 2. Get parent payment history
// ============================================================

export async function getParentPaymentHistory(): Promise<{
  data: (Payment & {
    booking: Booking | null;
    package: Package | null;
  })[];
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
      .select("*, bookings(*), packages(*)")
      .eq("parent_id", parentProfile.id)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((p) => ({
      ...p,
      booking: ((p as Record<string, unknown>).bookings as Booking) ?? null,
      package: ((p as Record<string, unknown>).packages as Package) ?? null,
      bookings: undefined,
      packages: undefined,
    })) as (Payment & { booking: Booking | null; package: Package | null })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getParentPaymentHistory error:", err);
    return { data: [], error: "Failed to load payment history." };
  }
}

// ============================================================
// 3. Get parent waitlist with sessions
// ============================================================

export async function getParentWaitlistWithSessions(): Promise<{
  data: (WaitlistEntry & { session: BookableSession })[];
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
      .from("waitlist")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .in("status", ["waiting", "offered"])
      .order("created_at", { ascending: true });

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((w) => ({
      ...w,
      session: (w as Record<string, unknown>)
        .bookable_sessions as unknown as BookableSession,
      bookable_sessions: undefined,
    })) as (WaitlistEntry & { session: BookableSession })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getParentWaitlistWithSessions error:", err);
    return { data: [], error: "Failed to load waitlist entries." };
  }
}

// ============================================================
// 4. Get booking with details
// ============================================================

export async function getBookingWithDetails(
  bookingId: string
): Promise<{
  data: (Booking & {
    session: BookableSession;
    payment: Payment | null;
    coach_name: string | null;
  }) | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("id", bookingId)
      .single();

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: "Booking not found." };

    const session = (data as Record<string, unknown>)
      .bookable_sessions as unknown as BookableSession;

    // Get payment if linked
    let payment: Payment | null = null;
    if (data.payment_id) {
      const { data: paymentData } = await supabase
        .from("payments")
        .select("*")
        .eq("id", data.payment_id)
        .single();
      payment = paymentData;
    }

    // Get coach name if session has coach_id
    let coach_name: string | null = null;
    if (session?.coach_id) {
      const { data: coachProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", session.coach_id)
        .single();
      coach_name = coachProfile?.name ?? null;
    }

    const result = {
      ...data,
      session,
      bookable_sessions: undefined,
      payment,
      coach_name,
    } as Booking & {
      session: BookableSession;
      payment: Payment | null;
      coach_name: string | null;
    };

    return { data: result, error: null };
  } catch (err) {
    console.error("getBookingWithDetails error:", err);
    return { data: null, error: "Failed to load booking details." };
  }
}

// ============================================================
// 5. Get admin booking dashboard
// ============================================================

export async function getAdminBookingDashboard(): Promise<{
  data: AdminBookingDashboardData | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekISO = startOfWeek.toISOString();
    const todayStr = today.toISOString().split("T")[0];

    // Total bookings this week
    const { count: totalBookingsThisWeek } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("booked_at", startOfWeekISO);

    // Revenue this week (confirmed bookings)
    const { data: weekBookings } = await supabase
      .from("bookings")
      .select("total_cents")
      .eq("status", "confirmed")
      .gte("booked_at", startOfWeekISO);

    const revenueThisWeek = (weekBookings ?? []).reduce(
      (sum, b) => sum + (b.total_cents ?? 0),
      0
    );

    // Package revenue this week
    const { data: weekPackagePayments } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("payment_type", "package_purchase")
      .eq("status", "completed")
      .gte("created_at", startOfWeekISO);

    const packageRevenueThisWeek = (weekPackagePayments ?? []).reduce(
      (sum, p) => sum + (p.amount_cents ?? 0),
      0
    );

    // Upcoming sessions with capacity info
    const { data: upcomingSessions } = await supabase
      .from("bookable_sessions")
      .select("*")
      .gte("date", todayStr)
      .in("status", ["open", "closed"])
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(20);

    // Active waitlist count
    const { count: activeWaitlistCount } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true })
      .in("status", ["waiting", "offered"]);

    // All bookable sessions with booking counts
    const { data: allSessionsRaw } = await supabase
      .from("bookable_sessions")
      .select("*")
      .order("date", { ascending: false })
      .limit(50);

    const allBookableSessions = (allSessionsRaw ?? []).map((s) => ({
      ...s,
      booking_count: s.current_bookings ?? 0,
    })) as (BookableSession & { booking_count: number })[];

    return {
      data: {
        totalBookingsThisWeek: totalBookingsThisWeek ?? 0,
        revenueThisWeek,
        packageRevenueThisWeek,
        upcomingSessions: (upcomingSessions ?? []) as BookableSession[],
        activeWaitlistCount: activeWaitlistCount ?? 0,
        allBookableSessions,
      },
      error: null,
    };
  } catch (err) {
    console.error("getAdminBookingDashboard error:", err);
    return { data: null, error: "Failed to load admin dashboard." };
  }
}

// ============================================================
// 6. Get admin bookings list
// ============================================================

export async function getAdminBookingsList(
  filters?: AdminBookingsFilters
): Promise<{
  data: (Booking & {
    parent_name: string;
    session_title: string;
  })[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("bookings")
      .select("*, parent_profiles!inner(first_name, last_name), bookable_sessions!inner(title, date)")
      .order("booked_at", { ascending: false });

    if (filters?.session_id) {
      query = query.eq("bookable_session_id", filters.session_id);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.payment_type) {
      query = query.eq("payment_type", filters.payment_type);
    }
    if (filters?.date_from) {
      query = query.gte("bookable_sessions.date", filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte("bookable_sessions.date", filters.date_to);
    }

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((b) => {
      const parent = (b as Record<string, unknown>).parent_profiles as {
        first_name: string;
        last_name: string;
      };
      const session = (b as Record<string, unknown>).bookable_sessions as {
        title: string;
        date: string;
      };
      return {
        ...b,
        parent_name: `${parent.first_name} ${parent.last_name}`,
        session_title: session.title,
        parent_profiles: undefined,
        bookable_sessions: undefined,
      };
    }) as (Booking & { parent_name: string; session_title: string })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getAdminBookingsList error:", err);
    return { data: [], error: "Failed to load bookings list." };
  }
}

// ============================================================
// 7. Get session attendees
// ============================================================

export async function getSessionAttendees(
  sessionId: string
): Promise<{
  data: SessionAttendee[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get all confirmed bookings for the session
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("*, parent_profiles!inner(first_name, last_name, phone, email)")
      .eq("bookable_session_id", sessionId)
      .eq("status", "confirmed");

    if (bookingsError) return { data: [], error: bookingsError.message };

    // Get attendance records if any exist (for completed sessions)
    const { data: attendanceRecords } = await supabase
      .from("session_attendances")
      .select("child_id, status")
      .eq("session_id", sessionId);

    const attendanceMap = new Map<string, string>();
    (attendanceRecords ?? []).forEach((a) => {
      attendanceMap.set(a.child_id, a.status);
    });

    const attendees: SessionAttendee[] = [];

    (bookings ?? []).forEach((booking) => {
      const parent = (booking as Record<string, unknown>).parent_profiles as {
        first_name: string;
        last_name: string;
        phone: string | null;
        email: string;
      };
      const children = booking.children_json as BookingChildEntry[];

      children.forEach((child) => {
        attendees.push({
          booking_id: booking.id,
          child_id: child.child_id,
          child_name: child.child_name,
          age_group: child.age_group,
          parent_id: booking.parent_id,
          parent_name: `${parent.first_name} ${parent.last_name}`,
          parent_phone: parent.phone,
          parent_email: parent.email,
          attendance_status: attendanceMap.get(child.child_id) ?? null,
        });
      });
    });

    return { data: attendees, error: null };
  } catch (err) {
    console.error("getSessionAttendees error:", err);
    return { data: [], error: "Failed to load session attendees." };
  }
}

// ============================================================
// 8. Get no-show stats
// ============================================================

export async function getNoShowStats(): Promise<{
  data: NoShowParent[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get all bookings grouped by parent
    const { data: allBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("parent_id, status, parent_profiles!inner(first_name, last_name, email)")
      .in("status", ["confirmed", "no_show"]);

    if (bookingsError) return { data: [], error: bookingsError.message };

    // Aggregate by parent
    const parentStats = new Map<
      string,
      {
        parent_name: string;
        parent_email: string;
        total_bookings: number;
        no_show_count: number;
      }
    >();

    (allBookings ?? []).forEach((b) => {
      const parent = (b as Record<string, unknown>).parent_profiles as {
        first_name: string;
        last_name: string;
        email: string;
      };

      const existing = parentStats.get(b.parent_id) ?? {
        parent_name: `${parent.first_name} ${parent.last_name}`,
        parent_email: parent.email,
        total_bookings: 0,
        no_show_count: 0,
      };

      existing.total_bookings++;
      if (b.status === "no_show") {
        existing.no_show_count++;
      }

      parentStats.set(b.parent_id, existing);
    });

    const result: NoShowParent[] = Array.from(parentStats.entries()).map(
      ([parent_id, stats]) => {
        const no_show_rate =
          stats.total_bookings > 0
            ? stats.no_show_count / stats.total_bookings
            : 0;
        return {
          parent_id,
          parent_name: stats.parent_name,
          parent_email: stats.parent_email,
          total_bookings: stats.total_bookings,
          no_show_count: stats.no_show_count,
          no_show_rate,
          flagged: no_show_rate > 0.3 && stats.total_bookings >= 5,
        };
      }
    );

    // Sort by no-show rate descending
    result.sort((a, b) => b.no_show_rate - a.no_show_rate);

    return { data: result, error: null };
  } catch (err) {
    console.error("getNoShowStats error:", err);
    return { data: [], error: "Failed to load no-show stats." };
  }
}

// ============================================================
// 9. Confirm waitlist spot
// ============================================================

export async function confirmWaitlistSpot(
  waitlistEntryId: string,
  paymentType: BookingPaymentType,
  packageBalanceId?: string
): Promise<{ data: Booking | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    // Get waitlist entry
    const { data: entry, error: entryError } = await supabase
      .from("waitlist")
      .select("*, bookable_sessions(*)")
      .eq("id", waitlistEntryId)
      .single();

    if (entryError || !entry) {
      return { data: null, error: "Waitlist entry not found." };
    }

    // Validate entry is in 'offered' status
    if (entry.status !== "offered") {
      return { data: null, error: "This waitlist entry is not in offered status." };
    }

    // Check offer has not expired
    if (entry.offer_expires_at && new Date(entry.offer_expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from("waitlist")
        .update({ status: "expired" })
        .eq("id", waitlistEntryId);
      return { data: null, error: "This offer has expired." };
    }

    // Get child details from parent_children and children tables
    const { data: childData } = await supabase
      .from("children")
      .select("id, name, age_group")
      .eq("id", entry.child_id)
      .single();

    const childEntry: BookingChildEntry = {
      child_id: entry.child_id,
      child_name: childData?.name ?? "Unknown",
      age_group: childData?.age_group ?? "",
    };

    // Create booking using the existing createBooking function
    const { data: booking, error: bookingError } = await createBooking({
      bookable_session_id: entry.bookable_session_id,
      children: [childEntry],
      payment_type: paymentType,
      package_balance_id: packageBalanceId,
    });

    if (bookingError) return { data: null, error: bookingError };

    // Update waitlist entry to accepted
    await supabase
      .from("waitlist")
      .update({ status: "accepted" })
      .eq("id", waitlistEntryId);

    return { data: booking, error: null };
  } catch (err) {
    console.error("confirmWaitlistSpot error:", err);
    return { data: null, error: "Failed to confirm waitlist spot." };
  }
}

// ============================================================
// 10. Get testimonial candidates
// ============================================================

export async function getTestimonialCandidates(): Promise<{
  data: TestimonialCandidate[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get high-rated feedback with comments
    const { data: ratings, error: ratingsError } = await supabase
      .from("feedback_ratings")
      .select("*")
      .gte("rating", 4)
      .not("comment", "is", null)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });

    if (ratingsError) return { data: [], error: ratingsError.message };

    // Get existing approved testimonials to exclude
    const { data: existingTestimonials } = await supabase
      .from("approved_testimonials")
      .select("feedback_rating_id");

    const excludedIds = new Set(
      (existingTestimonials ?? [])
        .map((t) => t.feedback_rating_id)
        .filter(Boolean)
    );

    // Filter out already-processed ratings
    const candidateRatings = (ratings ?? []).filter(
      (r) => !excludedIds.has(r.id)
    );

    if (candidateRatings.length === 0) return { data: [], error: null };

    // Get centre names
    const centreIds = [...new Set(candidateRatings.map((r) => r.centre_id))];
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name")
      .in("id", centreIds);

    const centreMap = new Map<string, string>();
    (centres ?? []).forEach((c) => centreMap.set(c.id, c.name));

    // Get coach names
    const coachIds = [
      ...new Set(
        candidateRatings
          .map((r) => r.coach_id)
          .filter((id): id is string => id !== null)
      ),
    ];

    const coachMap = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coaches } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", coachIds);

      (coaches ?? []).forEach((c) => coachMap.set(c.id, c.name));
    }

    const result: TestimonialCandidate[] = candidateRatings.map((r) => ({
      id: r.id,
      session_id: r.session_id,
      centre_id: r.centre_id,
      coach_id: r.coach_id,
      sport: r.sport,
      rating: r.rating!,
      comment: r.comment!,
      submitted_at: r.submitted_at,
      created_at: r.created_at,
      centre_name: centreMap.get(r.centre_id) ?? "Unknown Centre",
      coach_name: r.coach_id ? coachMap.get(r.coach_id) ?? null : null,
    }));

    return { data: result, error: null };
  } catch (err) {
    console.error("getTestimonialCandidates error:", err);
    return { data: [], error: "Failed to load testimonial candidates." };
  }
}

// ============================================================
// 11. Approve testimonial
// ============================================================

export async function approveTestimonial(
  input: ApproveTestimonialInput
): Promise<{ data: ApprovedTestimonial | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("approved_testimonials")
      .insert({
        feedback_rating_id: input.feedback_rating_id,
        centre_name: input.centre_name,
        comment: input.comment,
        rating: input.rating,
        display_name: input.display_name,
        status: "approved" as TestimonialStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("approveTestimonial error:", err);
    return { data: null, error: "Failed to approve testimonial." };
  }
}

// ============================================================
// 12. Reject testimonial
// ============================================================

export async function rejectTestimonial(
  feedbackRatingId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    // Create a rejected entry so it won't appear in candidates again
    const { error } = await supabase.from("approved_testimonials").insert({
      feedback_rating_id: feedbackRatingId,
      centre_name: "",
      comment: "",
      rating: 0,
      display_name: "",
      status: "rejected" as TestimonialStatus,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("rejectTestimonial error:", err);
    return { error: "Failed to reject testimonial." };
  }
}

// ============================================================
// 13. Get approved testimonials
// ============================================================

export async function getApprovedTestimonials(): Promise<{
  data: ApprovedTestimonial[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("approved_testimonials")
      .select("*")
      .eq("status", "approved")
      .order("approved_at", { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getApprovedTestimonials error:", err);
    return { data: [], error: "Failed to load testimonials." };
  }
}

// ============================================================
// 14. Unpublish testimonial
// ============================================================

export async function unpublishTestimonial(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("approved_testimonials")
      .update({ status: "rejected" as TestimonialStatus })
      .eq("id", id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("unpublishTestimonial error:", err);
    return { error: "Failed to unpublish testimonial." };
  }
}
