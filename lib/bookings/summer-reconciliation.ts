import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { summerSquare } from "@/lib/bookings/summer-square";

type Order = { order: { state?: string; tenders?: { id?: string; payment_id?: string }[] } };
type Payment = {
  payment: {
    id: string;
    status: string;
    order_id: string;
    location_id: string;
    total_money?: { amount: number; currency: string };
  };
};

type HeldBooking = { id: string; square_order_id: string; amount_cents: number };

export async function reconcileSummerBooking(
  db: ReturnType<typeof createSupabaseAdmin>,
  booking: HeldBooking,
): Promise<boolean> {
  const { order } = await summerSquare<Order>(
    `/orders/${encodeURIComponent(booking.square_order_id)}`,
  );
  for (const tender of order.tenders ?? []) {
    const paymentId = tender.payment_id ?? tender.id;
    if (!paymentId) continue;
    const { payment } = await summerSquare<Payment>(`/payments/${encodeURIComponent(paymentId)}`);
    if (
      payment.status !== "COMPLETED" ||
      payment.order_id !== booking.square_order_id ||
      payment.location_id !== process.env.SQUARE_LOCATION_ID ||
      payment.total_money?.amount !== booking.amount_cents ||
      payment.total_money?.currency !== "AUD"
    ) continue;

    const { data: updated, error } = await db.from("summer_clinic_orders")
      .update({ status: "paid", square_payment_id: payment.id })
      .eq("id", booking.id).eq("status", "held").select("id").maybeSingle();
    if (error) throw new Error("Could not persist verified clinic payment.");
    if (updated) return true;
    const { data, error: readError } = await db.from("summer_clinic_orders")
      .select("status").eq("id", booking.id).single();
    if (readError) throw new Error("Could not load verified clinic status.");
    return data.status === "paid";
  }
  return false;
}

export async function expireSummerBooking(
  db: ReturnType<typeof createSupabaseAdmin>,
  booking: HeldBooking & { square_link_id: string },
): Promise<boolean> {
  const orderPath = `/orders/${encodeURIComponent(booking.square_order_id)}`;
  let { order } = await summerSquare<Order>(orderPath);
  if (order.tenders?.length) return false;

  if (order.state !== "CANCELED") {
    const deleted = await summerSquare<{ cancelled_order_id?: string }>(
      `/online-checkout/payment-links/${encodeURIComponent(booking.square_link_id)}`,
      undefined,
      "DELETE",
    );
    if (deleted.cancelled_order_id !== booking.square_order_id) return false;
    ({ order } = await summerSquare<Order>(orderPath));
  }

  if (order.state !== "CANCELED" || order.tenders?.length) return false;
  const { data, error } = await db.from("summer_clinic_orders")
    .update({ status: "cancelled" }).eq("id", booking.id).eq("status", "held")
    .eq("square_order_id", booking.square_order_id).select("id").maybeSingle();
  if (error) throw new Error("Could not release cancelled clinic reservation.");
  return Boolean(data);
}
