import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getSquareApiUrl } from "@/lib/payments/square-config";
import { confirmBookingPayment } from "@/lib/bookings/booking-actions";

// Resolved at request-time so a redeploy with a flipped SQUARE_ENV
// picks up immediately without bundle invalidation.
//
// Seam-walk rewrite (S3/S4/S6): the amount charged is derived
// SERVER-SIDE from the booking/package row — the client's amountCents
// is only an integrity check, never the charge source. The payments
// insert matches the real 035 schema (parent_id, payment_type,
// lowercase status enum), and booking confirmation goes through
// confirmBookingPayment so capacity, notifications and the receipt
// email all fire — previously none of them did for card payments.

interface CreatePaymentBody {
  sourceId: string;
  bookingId?: string;
  packageId?: string;
  amountCents: number;
  idempotencyKey: string;
}

export async function POST(request: Request) {
  try {
    // 1. Validate auth
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorised. Please log in." },
        { status: 401 }
      );
    }

    // Verify the user has a parent profile
    const { data: parentProfile, error: profileError } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !parentProfile) {
      return NextResponse.json(
        { error: "Parent profile not found." },
        { status: 403 }
      );
    }

    // 2. Parse and validate request body
    const body: CreatePaymentBody = await request.json();
    const { sourceId, bookingId, packageId, amountCents, idempotencyKey } = body;

    if (!sourceId || !amountCents || !idempotencyKey) {
      return NextResponse.json(
        { error: "Missing required fields: sourceId, amountCents, idempotencyKey." },
        { status: 400 }
      );
    }

    if (amountCents <= 0 || !Number.isInteger(amountCents)) {
      return NextResponse.json(
        { error: "amountCents must be a positive integer." },
        { status: 400 }
      );
    }

    if (!bookingId && !packageId) {
      return NextResponse.json(
        { error: "A bookingId or packageId is required." },
        { status: 400 }
      );
    }

    // 3. Derive the charge amount from the database — BEFORE charging.
    const admin = createSupabaseAdmin();
    let expectedAmountCents: number;
    let paymentType: "session_booking" | "package_purchase";

    if (bookingId) {
      const { data: booking } = await admin
        .from("bookings")
        .select("id, parent_id, total_cents, status")
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking || booking.parent_id !== parentProfile.id) {
        return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      }
      if (booking.status !== "pending_payment") {
        return NextResponse.json(
          { error: "This booking has already been paid or cancelled." },
          { status: 400 }
        );
      }
      expectedAmountCents = booking.total_cents;
      paymentType = "session_booking";
    } else {
      const { data: pkg } = await admin
        .from("packages")
        .select("id, price_cents, status")
        .eq("id", packageId!)
        .maybeSingle();
      if (!pkg || pkg.status !== "active") {
        return NextResponse.json({ error: "Package not found." }, { status: 404 });
      }
      expectedAmountCents = pkg.price_cents;
      paymentType = "package_purchase";
    }

    if (amountCents !== expectedAmountCents) {
      // Stale price on the client (or tampering) — never charge it.
      return NextResponse.json(
        {
          error:
            "The price has changed since this page loaded. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    // 4. Call Square Payments API with the SERVER-derived amount
    const squareResponse = await fetch(getSquareApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Square-Version": "2024-01-18",
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        amount_money: {
          amount: expectedAmountCents,
          currency: "AUD",
        },
        location_id: process.env.SQUARE_LOCATION_ID,
      }),
    });

    const squareData = await squareResponse.json();

    if (!squareResponse.ok) {
      const errorMessage =
        squareData?.errors?.[0]?.detail ||
        squareData?.errors?.[0]?.code ||
        "Payment processing failed. Please try again.";

      console.error("Square payment error:", JSON.stringify(squareData.errors));

      return NextResponse.json(
        { error: errorMessage },
        { status: squareResponse.status }
      );
    }

    const squarePayment = squareData.payment;

    // 5. Create the payment record — real 035 columns only.
    const { data: paymentRecord, error: insertError } = await admin
      .from("payments")
      .insert({
        parent_id: parentProfile.id,
        amount_cents: expectedAmountCents,
        payment_type: paymentType,
        square_payment_id: squarePayment.id,
        status: squarePayment.status === "COMPLETED" ? "completed" : "pending",
        booking_id: bookingId || null,
        package_id: packageId || null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to save payment record:", insertError);
      // The charge went through at Square but our record failed. The
      // client treats a null paymentId as needs-support, NOT success.
      return NextResponse.json(
        {
          paymentId: null,
          squarePaymentId: squarePayment.id,
          warning:
            "Payment processed but failed to save record. Please contact support.",
        },
        { status: 200 }
      );
    }

    // 6. Booking: confirm through the one real path — status flip,
    // capacity increment, confirmation notifications, receipt email.
    if (bookingId) {
      const { error: confirmError } = await confirmBookingPayment(
        bookingId,
        paymentRecord.id
      );
      if (confirmError) {
        console.error("confirmBookingPayment failed:", confirmError);
      }
    }

    // Package balances are created by purchasePackage() from the
    // packages page after this call returns — nothing to do here.

    // 7. Check referral conversion (first booking by a referred parent)
    if (bookingId) {
      try {
        const { count } = await admin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", parentProfile.id)
          .eq("status", "confirmed");

        if (count === 1) {
          const { processReferralConversion } = await import(
            "@/lib/referrals/actions"
          );
          await processReferralConversion(
            parentProfile.id,
            "first_booking"
          ).catch((err: unknown) =>
            console.error("Referral conversion error:", err)
          );
        }
      } catch (refErr) {
        console.error("Referral conversion check error:", refErr);
      }
    }

    // 8. Return success
    return NextResponse.json({
      paymentId: paymentRecord.id,
      squarePaymentId: squarePayment.id,
    });
  } catch (error) {
    console.error("Payment endpoint error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
