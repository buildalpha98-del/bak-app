import { notFound } from "next/navigation";
import { z } from "zod";
import { Section } from "@/components/marketing/section";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { summerSquare } from "@/lib/bookings/summer-square";

type Order = { order: { tenders?: { id?: string; payment_id?: string }[] } };
type Payment = { payment: { id: string; status: string; order_id: string; location_id: string;
  total_money?: { amount: number; currency: string } } };

export default async function Confirmation({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const id = z.uuid().safeParse((await searchParams).booking);
  if (!summerClinicsEnabled() || !id.success) notFound();
  const db = createSupabaseAdmin();
  const { data: booking } = await db.from("summer_clinic_orders")
    .select("status,clinic_dates,amount_cents,square_order_id").eq("id", id.data).maybeSingle();
  if (!booking || !booking.square_order_id) notFound();

  let paid = booking.status === "paid";
  if (booking.status === "held") {
    try {
      const { order } = await summerSquare<Order>(`/orders/${encodeURIComponent(booking.square_order_id)}`);
      for (const tender of order.tenders ?? []) {
        const paymentId = tender.payment_id ?? tender.id;
        if (!paymentId) continue;
        const { payment } = await summerSquare<Payment>(`/payments/${encodeURIComponent(paymentId)}`);
        if (payment.status !== "COMPLETED" || payment.order_id !== booking.square_order_id ||
          payment.location_id !== process.env.SQUARE_LOCATION_ID ||
          payment.total_money?.amount !== booking.amount_cents || payment.total_money?.currency !== "AUD") continue;
        const { data } = await db.from("summer_clinic_orders")
          .update({ status: "paid", square_payment_id: payment.id }).eq("id", id.data)
          .eq("status", "held").select("id").maybeSingle();
        if (data) paid = true;
        break;
      }
    } catch {
      // A delayed or unreachable Square response remains unconfirmed.
    }
  }

  return (
    <Section aria-label="Booking status">
      <h1 className="text-3xl font-bold">{paid ? "Booking confirmed" : "Payment confirmation pending"}</h1>
      <ul className="my-4 list-disc pl-6">
        {SUMMER_CLINICS.filter((clinic) => booking.clinic_dates.includes(clinic.date)).map((clinic) => (
          <li key={clinic.date}>{formatSummerDate(clinic.date)} · {clinic.title} · {clinic.park}, {clinic.suburb}</li>
        ))}
      </ul>
      {!paid && <p>Refresh to check again. If Square has already charged you, call 0426 722 003 before paying again.</p>}
    </Section>
  );
}
