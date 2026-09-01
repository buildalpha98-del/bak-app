"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Booking,
  BookingChildEntry,
  Payment,
  Package,
  PackageBalance,
  BookableSession,
} from "@/lib/types/database";
import type {
  BookingStatus,
  BookingPaymentType,
  PaymentStatus,
  PackageStatus,
} from "@/lib/types/enums";
import { processWaitlistForSession } from "@/lib/bookings/actions";
import { sendEmail } from "@/lib/launch/email";
import { createNotification } from "@/lib/launch/notifications";
import {
  bookingConfirmation,
  bookingCancellation,
  paymentReceipt,
  packageConfirmation,
} from "@/lib/launch/email-templates";

// ============================================================
// 1. Get parent bookings
// ============================================================

export async function getParentBookings(): Promise<{
  data: (Booking & { session: BookableSession })[];
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
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .order("booked_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((b) => ({
      ...b,
      session: (b as Record<string, unknown>)
        .bookable_sessions as unknown as BookableSession,
      bookable_sessions: undefined,
    })) as (Booking & { session: BookableSession })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getParentBookings error:", err);
    return { data: [], error: "Failed to load bookings." };
  }
}

// ============================================================
// 2. Get booking by ID
// ============================================================

export async function getBookingById(
  id: string
): Promise<{
  data: (Booking & { session: BookableSession }) | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("id", id)
      .single();

    if (error) return { data: null, error: error.message };

    const result = {
      ...data,
      session: (data as Record<string, unknown>)
        .bookable_sessions as unknown as BookableSession,
      bookable_sessions: undefined,
    } as Booking & { session: BookableSession };

    return { data: result, error: null };
  } catch (err) {
    console.error("getBookingById error:", err);
    return { data: null, error: "Failed to load booking." };
  }
}

// ============================================================
// 3. Create booking
// ============================================================

interface CreateBookingInput {
  bookable_session_id: string;
  children: BookingChildEntry[];
  payment_type: BookingPaymentType;
  package_balance_id?: string;
}

export async function createBooking(
  input: CreateBookingInput
): Promise<{ data: Booking | null; error: string | null }> {
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

    // Get session to calculate total
    const { data: session, error: sessionError } = await supabase
      .from("bookable_sessions")
      .select("*")
      .eq("id", input.bookable_session_id)
      .single();

    if (sessionError || !session) {
      return { data: null, error: "Session not found." };
    }

    // Age eligibility (seam S14): the check was client-only. Validate
    // each booked child's age against the session's band server-side.
    if (session.age_group_min != null || session.age_group_max != null) {
      const childIds = input.children.map((c) => c.child_id).filter(Boolean);
      if (childIds.length > 0) {
        const { data: childRows } = await supabase
          .from("children")
          .select("id, first_name, date_of_birth")
          .in("id", childIds);
        for (const child of childRows ?? []) {
          if (!child.date_of_birth) continue;
          const dob = new Date(child.date_of_birth);
          const now = new Date();
          let age = now.getFullYear() - dob.getFullYear();
          const m = now.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
          if (
            age < (session.age_group_min ?? 0) ||
            age > (session.age_group_max ?? 99)
          ) {
            return {
              data: null,
              error: `${child.first_name} is outside this session's age range (${session.age_group_min ?? "any"}–${session.age_group_max ?? "any"}).`,
            };
          }
        }
      }
    }

    // Capacity guard (seam S8): the "Session full" gate was UI-only and
    // bypassable by URL.
    if (
      session.max_capacity != null &&
      session.current_bookings + input.children.length > session.max_capacity
    ) {
      return {
        data: null,
        error: "This session is full — join the waitlist instead.",
      };
    }

    const totalCents = session.price_cents * input.children.length;

    if (input.payment_type === "package_redemption") {
      if (!input.package_balance_id) {
        return { data: null, error: "Package balance ID is required for package redemption." };
      }

      // Validate package balance
      const { data: balance, error: balanceError } = await supabase
        .from("package_balances")
        .select("*, packages(*)")
        .eq("id", input.package_balance_id)
        .eq("parent_id", parentProfile.id)
        .eq("status", "active")
        .single();

      if (balanceError || !balance) {
        return { data: null, error: "Invalid or inactive package balance." };
      }

      if (balance.remaining_sessions < input.children.length) {
        return {
          data: null,
          error: `Insufficient sessions remaining. You have ${balance.remaining_sessions} but need ${input.children.length}.`,
        };
      }

      // Check session type eligibility
      const pkg = (balance as Record<string, unknown>).packages as Package | null;
      if (pkg?.applicable_session_types && pkg.applicable_session_types.length > 0) {
        if (!pkg.applicable_session_types.includes(session.session_type)) {
          return {
            data: null,
            error: "This package is not eligible for this session type.",
          };
        }
      }

      // Decrement remaining sessions
      const { error: decrementError } = await supabase
        .from("package_balances")
        .update({
          remaining_sessions: balance.remaining_sessions - input.children.length,
        })
        .eq("id", input.package_balance_id);

      if (decrementError) {
        return { data: null, error: "Failed to redeem package sessions." };
      }

      // Create booking as confirmed
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          bookable_session_id: input.bookable_session_id,
          parent_id: parentProfile.id,
          children_json: input.children,
          payment_type: input.payment_type,
          package_balance_id: input.package_balance_id,
          total_cents: totalCents,
          status: "confirmed" as BookingStatus,
          booked_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (bookingError) return { data: null, error: bookingError.message };

      // Increment session current_bookings
      await supabase
        .from("bookable_sessions")
        .update({ current_bookings: session.current_bookings + input.children.length })
        .eq("id", input.bookable_session_id);

      // Seam S1: booked children must reach centre_children or the
      // coach never sees them (see enrolBookedChildren).
      await enrolBookedChildren(session, input.children);

      // Send booking confirmation email + notification (fire-and-forget)
      void sendBookingConfirmationNotifications(
        supabase,
        parentProfile.id,
        booking,
        session,
        input.children
      ).catch(console.error);

      return { data: booking, error: null };
    }

    // Single payment flow — booking created as pending_payment
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        bookable_session_id: input.bookable_session_id,
        parent_id: parentProfile.id,
        children_json: input.children,
        payment_type: input.payment_type,
        total_cents: totalCents,
        status: "pending_payment" as BookingStatus,
        booked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (bookingError) return { data: null, error: bookingError.message };

    return { data: booking, error: null };
  } catch (err) {
    console.error("createBooking error:", err);
    return { data: null, error: "Failed to create booking." };
  }
}

// ============================================================
// 4. Confirm booking payment
// ============================================================

/**
 * Apply a discount code and/or a referral reward to a pending booking
 * SERVER-SIDE (seam S6). The booking's total_cents becomes the single
 * source of the charge amount — /api/payments/create rejects any
 * client mismatch before charging. Redemption happens at confirmation,
 * not here, so an abandoned checkout never burns the code.
 */
export async function applyBookingAdjustments(
  bookingId: string,
  input: { discountCode?: string | null; referralRewardId?: string | null }
): Promise<{
  data: { totalCents: number; discountCents: number } | null;
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

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, parent_id, status, children_json, bookable_sessions(price_cents)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking || booking.parent_id !== parentProfile.id) {
      return { data: null, error: "Booking not found." };
    }
    if (booking.status !== "pending_payment") {
      return { data: null, error: "This booking is no longer pending." };
    }

    const priceCents =
      (booking.bookable_sessions as unknown as { price_cents: number } | null)
        ?.price_cents ?? 0;
    const childCount = (booking.children_json as unknown[]).length;
    const subtotal = priceCents * childCount;

    let discountCents = 0;
    let discountCodeId: string | null = null;
    let referralRewardId: string | null = null;

    if (input.discountCode) {
      const { validateDiscountCode } = await import(
        "@/lib/referrals/discount-actions"
      );
      const result = await validateDiscountCode(input.discountCode.trim());
      if (result.error || !result.data?.valid) {
        return { data: null, error: result.error ?? "Invalid or expired discount code." };
      }
      discountCents += result.data.valueCents;
      discountCodeId = result.data.codeId;
    }

    if (input.referralRewardId) {
      const { data: reward } = await supabase
        .from("referral_rewards")
        .select("id, reward_type, reward_value_cents, status, parent_id")
        .eq("id", input.referralRewardId)
        .maybeSingle();
      if (
        !reward ||
        reward.parent_id !== parentProfile.id ||
        reward.status === "redeemed" ||
        reward.status === "expired"
      ) {
        return { data: null, error: "That reward isn't available." };
      }
      // A milestone free session covers one child's price; credit
      // rewards use their stored value.
      discountCents +=
        reward.reward_type === "milestone_free_session"
          ? priceCents
          : (reward.reward_value_cents ?? 0);
      referralRewardId = reward.id;
    }

    discountCents = Math.min(discountCents, subtotal);
    const totalCents = subtotal - discountCents;

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        total_cents: totalCents,
        discount_cents: discountCents,
        discount_code_id: discountCodeId,
        referral_reward_id: referralRewardId,
      })
      .eq("id", bookingId)
      .eq("status", "pending_payment");
    if (updateError) return { data: null, error: updateError.message };

    return { data: { totalCents, discountCents }, error: null };
  } catch (err) {
    console.error("applyBookingAdjustments error:", err);
    return { data: null, error: "Failed to apply the discount." };
  }
}

/**
 * Confirm a booking whose (server-computed) total is zero — a full
 * referral credit or a free-session milestone (seam S7). Records a $0
 * payment row and runs the same confirmation chain as a card payment.
 */
export async function confirmZeroDollarBooking(
  bookingId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!parentProfile) return { error: "No parent profile." };

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, parent_id, status, total_cents")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking || booking.parent_id !== parentProfile.id) {
      return { error: "Booking not found." };
    }
    if (booking.status !== "pending_payment") {
      return { error: "This booking is no longer pending." };
    }
    if (booking.total_cents !== 0) {
      return { error: "This booking still has an amount owing." };
    }

    const { data: paymentRecord, error: payErr } = await supabase
      .from("payments")
      .insert({
        parent_id: parentProfile.id,
        amount_cents: 0,
        payment_type: "session_booking",
        status: "completed",
        booking_id: bookingId,
      })
      .select("id")
      .single();
    if (payErr || !paymentRecord) {
      return { error: payErr?.message ?? "Failed to record the booking." };
    }

    return await confirmBookingPayment(bookingId, paymentRecord.id);
  } catch (err) {
    console.error("confirmZeroDollarBooking error:", err);
    return { error: "Failed to confirm the booking." };
  }
}

/**
 * Seam S1: enrol booked children at the roster session's centre so
 * they appear on the coach's attendance list and accrue ratings and
 * insights. Only possible when the bookable session is linked to a
 * roster session (session_id). Admin client — centre_children writes
 * are staff-RLS'd and the caller has already verified ownership.
 * Failures log; they must never fail the booking itself.
 */
async function enrolBookedChildren(
  session: BookableSession,
  children: BookingChildEntry[]
): Promise<void> {
  try {
    const rosterSessionId = (session as unknown as Record<string, unknown>)
      .session_id as string | null;
    if (!rosterSessionId) return;
    const admin = createSupabaseAdmin();
    const { data: rosterSession } = await admin
      .from("sessions")
      .select("centre_id")
      .eq("id", rosterSessionId)
      .maybeSingle();
    const childIds = children.map((c) => c.child_id).filter(Boolean);
    if (!rosterSession?.centre_id || childIds.length === 0) return;
    await admin.from("centre_children").upsert(
      childIds.map((child_id) => ({
        centre_id: rosterSession.centre_id,
        child_id,
      })),
      { onConflict: "child_id,centre_id", ignoreDuplicates: true }
    );
  } catch (err) {
    console.error("Booking→enrolment linking failed:", err);
  }
}

export async function confirmBookingPayment(
  bookingId: string,
  paymentId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get the booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return { error: "Booking not found." };
    }

    const session = (booking as Record<string, unknown>)
      .bookable_sessions as unknown as BookableSession;

    // Update booking status and link payment
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "confirmed" as BookingStatus,
        payment_id: paymentId,
      })
      .eq("id", bookingId);

    if (updateError) return { error: updateError.message };

    // Increment session current_bookings
    const childCount = (booking.children_json as BookingChildEntry[]).length;
    await supabase
      .from("bookable_sessions")
      .update({ current_bookings: session.current_bookings + childCount })
      .eq("id", booking.bookable_session_id);

    // Seam S1: booked children must reach centre_children or the coach
    // never sees them (and they never accrue ratings or insights).
    await enrolBookedChildren(session, booking.children_json as BookingChildEntry[]);

    // Redeem the adjustments stamped on the booking (seam S6) — done
    // here, server-side, at the moment payment actually succeeded —
    // never in a fire-and-forget browser promise a closed tab loses.
    const bookingRow = booking as Record<string, unknown>;
    if (bookingRow.discount_code_id) {
      const { redeemDiscountCode } = await import(
        "@/lib/referrals/discount-actions"
      );
      void redeemDiscountCode(bookingRow.discount_code_id as string).catch(
        console.error
      );
    }
    if (bookingRow.referral_reward_id) {
      const { redeemReferralReward } = await import("@/lib/referrals/actions");
      void redeemReferralReward(bookingRow.referral_reward_id as string).catch(
        console.error
      );
    }

    // Send booking confirmation email + notification (fire-and-forget)
    void sendBookingConfirmationNotifications(
      supabase,
      booking.parent_id,
      booking,
      session,
      booking.children_json as BookingChildEntry[]
    ).catch(console.error);

    // Send payment receipt email (await — payment receipts are important)
    const totalDollars = `$${((booking.total_cents as number) / 100).toFixed(2)}`;
    const { data: parentForReceipt } = await supabase
      .from("parent_profiles")
      .select("email, first_name, user_id")
      .eq("id", booking.parent_id)
      .single();

    if (parentForReceipt?.email) {
      const receiptEmail = paymentReceipt({
        parentName: parentForReceipt.first_name,
        amount: totalDollars,
        description: session.title || "Session Booking",
        date: new Date().toISOString().split("T")[0],
      });
      await sendEmail({
        to: parentForReceipt.email,
        subject: receiptEmail.subject,
        html: receiptEmail.html,
        recipientId: parentForReceipt.user_id,
        emailType: "payment_receipt",
        metadata: { booking_id: bookingId, payment_id: paymentId },
      }).catch(console.error);
    }

    return { error: null };
  } catch (err) {
    console.error("confirmBookingPayment error:", err);
    return { error: "Failed to confirm booking payment." };
  }
}

// ============================================================
// 5. Cancel booking
// ============================================================

export async function cancelBooking(
  bookingId: string,
  reason?: string
): Promise<{ refundEligible: boolean; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get booking with session
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return { refundEligible: false, error: "Booking not found." };
    }

    const session = (booking as Record<string, unknown>)
      .bookable_sessions as unknown as BookableSession;

    // Determine refund eligibility: session date+time > 24 hours from now
    const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
    const now = new Date();
    const hoursUntilSession =
      (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const refundEligible = hoursUntilSession > 24;

    // If package redemption and eligible, restore package balance
    if (
      booking.payment_type === "package_redemption" &&
      refundEligible &&
      booking.package_balance_id
    ) {
      const { data: balance } = await supabase
        .from("package_balances")
        .select("remaining_sessions")
        .eq("id", booking.package_balance_id)
        .single();

      if (balance) {
        const childCount = (booking.children_json as BookingChildEntry[]).length;
        await supabase
          .from("package_balances")
          .update({
            remaining_sessions: balance.remaining_sessions + childCount,
          })
          .eq("id", booking.package_balance_id);
      }
    }

    // Update booking status
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled" as BookingStatus,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? null,
      })
      .eq("id", bookingId);

    if (updateError) {
      return { refundEligible: false, error: updateError.message };
    }

    // Decrement session current_bookings
    const childCount = (booking.children_json as BookingChildEntry[]).length;
    await supabase
      .from("bookable_sessions")
      .update({
        current_bookings: Math.max(0, session.current_bookings - childCount),
      })
      .eq("id", session.id);

    // Process waitlist for the session
    await processWaitlistForSession(booking.bookable_session_id);

    // Seam S11: refunds are manual (no Square Refunds integration),
    // but the parent email promises one — so the owed refund must land
    // in an operator's queue, not vanish. Card bookings only; package
    // credits are restored above.
    if (refundEligible && booking.payment_type === "single_payment") {
      const { triggerNotificationForOps } = await import(
        "@/lib/notifications/send"
      );
      void triggerNotificationForOps({
        type: "invoice_status_changed",
        title: `Refund owed: $${((booking.total_cents as number) / 100).toFixed(2)}`,
        body: `Booking for ${session.title ?? "a session"} on ${session.date} was cancelled >24h out — process the Square refund manually.`,
        entityType: "session",
        entityId: booking.bookable_session_id,
        data: { booking_id: bookingId },
      }).catch(console.error);
    }

    // Send cancellation email + notification (fire-and-forget)
    void (async () => {
      const { data: parent } = await supabase
        .from("parent_profiles")
        .select("email, first_name, user_id")
        .eq("id", booking.parent_id)
        .single();

      if (!parent?.email) return;

      const children = booking.children_json as BookingChildEntry[];
      const childNames = children.map((c) => c.child_name || "your child").join(", ");

      const cancelEmail = bookingCancellation({
        parentName: parent.first_name,
        childName: childNames,
        sessionName: session.title || "Session",
        date: session.date,
      });

      void sendEmail({
        to: parent.email,
        subject: cancelEmail.subject,
        html: cancelEmail.html,
        recipientId: parent.user_id,
        emailType: "booking_cancellation",
        metadata: { booking_id: bookingId },
      }).catch(console.error);

      void createNotification({
        userId: parent.user_id,
        type: "booking_confirmed",
        title: "Booking Cancelled",
        message: `Your booking for ${childNames} at ${session.title || "a session"} on ${session.date} has been cancelled.`,
        actionUrl: "/parent/bookings",
        metadata: { booking_id: bookingId },
      }).catch(console.error);
    })().catch(console.error);

    return { refundEligible, error: null };
  } catch (err) {
    console.error("cancelBooking error:", err);
    return { refundEligible: false, error: "Failed to cancel booking." };
  }
}

// ============================================================
// 6. Get active packages (parent display)
// ============================================================

export async function getActivePackages(): Promise<{
  data: Package[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .eq("status", "active")
      .order("price_cents", { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getActivePackages error:", err);
    return { data: [], error: "Failed to load packages." };
  }
}

// ============================================================
// 7. Get parent package balances
// ============================================================

export async function getParentPackageBalances(): Promise<{
  data: (PackageBalance & { package: Package })[];
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
      .from("package_balances")
      .select("*, packages(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "active")
      .order("expires_at", { ascending: true });

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((b) => ({
      ...b,
      package: (b as Record<string, unknown>)
        .packages as unknown as Package,
      packages: undefined,
    })) as (PackageBalance & { package: Package })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getParentPackageBalances error:", err);
    return { data: [], error: "Failed to load package balances." };
  }
}

// ============================================================
// 8. Create package (admin)
// ============================================================

interface CreatePackageInput {
  name: string;
  description?: string | null;
  session_count: number;
  price_cents: number;
  savings_cents: number;
  valid_days: number;
  applicable_session_types?: string[] | null;
  status: PackageStatus;
}

export async function createPackage(
  input: CreatePackageInput
): Promise<{ data: Package | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("packages")
      .insert({
        ...input,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("createPackage error:", err);
    return { data: null, error: "Failed to create package." };
  }
}

// ============================================================
// 9. Update package (admin)
// ============================================================

export async function updatePackage(
  id: string,
  updates: Partial<CreatePackageInput>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("packages")
      .update(updates)
      .eq("id", id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updatePackage error:", err);
    return { error: "Failed to update package." };
  }
}

// ============================================================
// 10. Get all packages (admin)
// ============================================================

export async function getPackagesAdmin(): Promise<{
  data: Package[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getPackagesAdmin error:", err);
    return { data: [], error: "Failed to load packages." };
  }
}

// ============================================================
// 11. Create payment record
// ============================================================

interface CreatePaymentInput {
  parent_id: string;
  booking_id?: string | null;
  package_id?: string | null;
  amount_cents: number;
  payment_type: string;
  square_payment_id?: string | null;
  square_order_id?: string | null;
  status: PaymentStatus;
}

export async function createPaymentRecord(
  input: CreatePaymentInput
): Promise<{ data: Payment | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("payments")
      .insert(input)
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("createPaymentRecord error:", err);
    return { data: null, error: "Failed to create payment record." };
  }
}

// ============================================================
// 12. Update payment status
// ============================================================

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  refundData?: { refund_amount_cents: number }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const updatePayload: Record<string, unknown> = { status };
    if (refundData) {
      updatePayload.refund_amount_cents = refundData.refund_amount_cents;
      updatePayload.refunded_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("payments")
      .update(updatePayload)
      .eq("id", paymentId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updatePaymentStatus error:", err);
    return { error: "Failed to update payment status." };
  }
}

// ============================================================
// 13. Purchase package
// ============================================================

export async function purchasePackage(
  packageId: string,
  paymentId: string
): Promise<{ data: PackageBalance | null; error: string | null }> {
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

    // Get package details
    const { data: pkg, error: pkgError } = await supabase
      .from("packages")
      .select("*")
      .eq("id", packageId)
      .single();

    if (pkgError || !pkg) {
      return { data: null, error: "Package not found." };
    }

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + pkg.valid_days);

    // Create package balance
    const { data: balance, error: balanceError } = await supabase
      .from("package_balances")
      .insert({
        parent_id: parentProfile.id,
        package_id: packageId,
        purchased_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        total_sessions: pkg.session_count,
        remaining_sessions: pkg.session_count,
        payment_id: paymentId,
        status: "active",
      })
      .select()
      .single();

    if (balanceError) return { data: null, error: balanceError.message };

    // Send package confirmation email + notification (fire-and-forget)
    void (async () => {
      const { data: parent } = await supabase
        .from("parent_profiles")
        .select("email, first_name, user_id")
        .eq("id", parentProfile.id)
        .single();

      if (!parent?.email) return;

      const totalDollars = `$${(pkg.price_cents / 100).toFixed(2)}`;

      const pkgEmail = packageConfirmation({
        parentName: parent.first_name,
        packageName: pkg.name,
        sessions: pkg.session_count,
        amount: totalDollars,
      });

      void sendEmail({
        to: parent.email,
        subject: pkgEmail.subject,
        html: pkgEmail.html,
        recipientId: parent.user_id,
        emailType: "package_confirmation",
        metadata: { package_id: packageId, payment_id: paymentId },
      }).catch(console.error);

      void createNotification({
        userId: parent.user_id,
        type: "payment_received",
        title: "Session Pack Purchased",
        message: `Your ${pkg.name} pack with ${pkg.session_count} sessions is now active.`,
        actionUrl: "/parent/bookings",
        metadata: { package_balance_id: balance.id },
      }).catch(console.error);
    })().catch(console.error);

    return { data: balance, error: null };
  } catch (err) {
    console.error("purchasePackage error:", err);
    return { data: null, error: "Failed to purchase package." };
  }
}

// ============================================================
// Helper: send booking confirmation email + notification
// ============================================================

async function sendBookingConfirmationNotifications(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  parentId: string,
  booking: Booking,
  session: BookableSession,
  children: BookingChildEntry[]
) {
  const { data: parent } = await supabase
    .from("parent_profiles")
    .select("email, first_name, user_id")
    .eq("id", parentId)
    .single();

  if (!parent?.email) return;

  const childNames = children
    .map((c) => c.child_name || "your child")
    .join(", ");

  const confirmEmail = bookingConfirmation({
    parentName: parent.first_name,
    childName: childNames,
    sessionName: session.title || "Session",
    date: session.date,
    time: `${session.start_time} – ${session.end_time}`,
    location: session.location_name || session.location_address || "",
  });

  void sendEmail({
    to: parent.email,
    subject: confirmEmail.subject,
    html: confirmEmail.html,
    recipientId: parent.user_id,
    emailType: "booking_confirmation",
    metadata: { booking_id: booking.id, session_id: session.id },
  }).catch(console.error);

  void createNotification({
    userId: parent.user_id,
    type: "booking_confirmed",
    title: "Booking Confirmed",
    message: `${childNames}'s session on ${session.date} is confirmed.`,
    actionUrl: `/parent/bookings`,
    metadata: { booking_id: booking.id },
  }).catch(console.error);
}
