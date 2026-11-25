import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { expireSummerBooking, reconcileSummerBooking } from "@/lib/bookings/summer-reconciliation";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!summerClinicsEnabled()) return NextResponse.json({ checked: 0 });

  const db = createSupabaseAdmin();
  const expiry = new Date(Date.now() - 30 * 60_000).toISOString();
  // A Square URL is returned only after its identifiers have been saved on a
  // held row. If this update wins a race with creation, that URL stays private.
  const { data: unexposed, error: cleanupError } = await db.from("summer_clinic_orders")
    .update({ status: "cancelled" }).eq("status", "held")
    .is("square_order_id", null).is("checkout_url", null).is("voucher_state", null)
    .lte("created_at", expiry).select("id");
  if (cleanupError) return NextResponse.json({ error: "Could not clear stale clinic holds." }, { status: 500 });

  const { error: voucherExpiryError } = await db.from("summer_clinic_orders")
    .update({ status: "cancelled" }).eq("status", "held").eq("voucher_state", "requested")
    .lte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  if (voucherExpiryError) return NextResponse.json({ error: "Could not clear stale voucher requests." }, { status: 500 });

  const { data: bookings, error } = await db.from("summer_clinic_orders")
    .select("id, square_order_id, square_link_id, amount_cents, voucher_credit_cents, voucher_state, clinic_dates, created_at").eq("status", "held")
    .not("square_order_id", "is", null).is("voucher_balance_closed_at", null)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).order("id")
    .limit(20);
  if (error) return NextResponse.json({ error: "Could not load clinic holds." }, { status: 500 });

  const checkedAt = new Date().toISOString();
  const results = await Promise.allSettled(bookings.map(async (booking) => {
    const { error: updateError } = await db.from("summer_clinic_orders")
      .update({ last_checked_at: checkedAt }).eq("id", booking.id).eq("status", "held");
    if (updateError) throw new Error("Could not record clinic payment check.");
    if (await reconcileSummerBooking(db, booking)) return "confirmed";
    const olderThanThirtyMinutes = Date.parse(booking.created_at) <= Date.parse(checkedAt) - 30 * 60_000;
    if (!booking.voucher_state && booking.square_link_id && olderThanThirtyMinutes && await expireSummerBooking(db, booking)) {
      return "released";
    }
    if (booking.voucher_state && booking.square_link_id &&
      booking.clinic_dates.some((date: string) => date <= sydneyTodayIso()) &&
      await expireSummerBooking(db, booking, true)) return "voucher_balance_closed";
    return "held";
  }));
  return NextResponse.json({
    checked: results.length,
    confirmed: results.filter((result) => result.status === "fulfilled" && result.value === "confirmed").length,
    released: unexposed.length + results.filter((result) => result.status === "fulfilled" && result.value === "released").length,
    failed: results.filter((result) => result.status === "rejected").length,
  });
}
