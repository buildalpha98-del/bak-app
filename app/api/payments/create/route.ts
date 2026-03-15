import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const SQUARE_API_URL =
  "https://connect.squareupsandbox.com/v2/payments";

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

    // 3. Call Square Payments API
    const squareResponse = await fetch(SQUARE_API_URL, {
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
          amount: amountCents,
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
    const admin = createSupabaseAdmin();

    // 4. Create payment record in database
    const { data: paymentRecord, error: insertError } = await admin
      .from("payments")
      .insert({
        user_id: user.id,
        parent_profile_id: parentProfile.id,
        square_payment_id: squarePayment.id,
        booking_id: bookingId || null,
        package_id: packageId || null,
        amount_cents: amountCents,
        currency: "AUD",
        status: squarePayment.status,
        idempotency_key: idempotencyKey,
        square_receipt_url: squarePayment.receipt_url || null,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to save payment record:", insertError);
      // Payment succeeded at Square but failed to save locally.
      // Return success with a warning so the client knows the charge went through.
      return NextResponse.json(
        {
          paymentId: null,
          squarePaymentId: squarePayment.id,
          warning: "Payment processed but failed to save record. Please contact support.",
        },
        { status: 200 }
      );
    }

    // 5. If bookingId provided, update booking status and increment current_bookings
    if (bookingId) {
      const { error: bookingError } = await admin
        .from("bookings")
        .update({ status: "confirmed", payment_id: paymentRecord.id })
        .eq("id", bookingId);

      if (bookingError) {
        console.error("Failed to update booking:", bookingError);
      }

      // Increment current_bookings on the related session/slot
      const { data: booking } = await admin
        .from("bookings")
        .select("session_id")
        .eq("id", bookingId)
        .single();

      if (booking?.session_id) {
        await admin.rpc("increment_current_bookings", {
          p_session_id: booking.session_id,
        });
      }
    }

    // 6. If packageId provided, create package_balance
    if (packageId) {
      const { error: balanceError } = await admin
        .from("package_balances")
        .insert({
          parent_profile_id: parentProfile.id,
          package_id: packageId,
          payment_id: paymentRecord.id,
          remaining_sessions: 0, // Will be set by trigger or package lookup
          created_at: new Date().toISOString(),
        });

      if (balanceError) {
        console.error("Failed to create package balance:", balanceError);
      }
    }

    // 7. Check referral conversion (first booking by a referred parent)
    if (bookingId) {
      try {
        // Check if this is the parent's first confirmed booking
        const { count } = await admin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("parent_id", parentProfile.id)
          .eq("status", "confirmed");

        if (count === 1) {
          // First booking — check if parent was referred
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
