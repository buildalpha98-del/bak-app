import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { expireSummerBooking, reconcileSummerBooking } from "@/lib/bookings/summer-reconciliation";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!summerClinicsEnabled()) return NextResponse.json({ checked: 0 });

  const db = createSupabaseAdmin();
  const { data: bookings, error } = await db.from("summer_clinic_orders")
    .select("id, square_order_id, square_link_id, amount_cents, created_at").eq("status", "held")
    .not("square_order_id", "is", null)
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
    if (booking.square_link_id && olderThanThirtyMinutes && await expireSummerBooking(db, booking)) {
      return "released";
    }
    return "held";
  }));
  return NextResponse.json({
    checked: results.length,
    confirmed: results.filter((result) => result.status === "fulfilled" && result.value === "confirmed").length,
    released: results.filter((result) => result.status === "fulfilled" && result.value === "released").length,
    failed: results.filter((result) => result.status === "rejected").length,
  });
}
