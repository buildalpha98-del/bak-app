import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Section } from "@/components/marketing/section";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled, summerParticipants } from "@/lib/bookings/summer-clinics";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { reconcileSummerBooking } from "@/lib/bookings/summer-reconciliation";

export default async function Confirmation({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const id = z.uuid().safeParse((await searchParams).booking);
  if (!summerClinicsEnabled() || !id.success) notFound();
  const db = createSupabaseAdmin();
  const { data: booking } = await db.from("summer_clinic_orders")
    .select("status,clinic_dates,child_name,booking_children,amount_cents,square_order_id,voucher_state,voucher_credit_cents,checkout_url,voucher_balance_closed_at").eq("id", id.data).maybeSingle();
  if (!booking || (!booking.square_order_id && !booking.voucher_state)) notFound();

  let paid = booking.status === "paid";
  if (booking.status === "held" && booking.square_order_id && !booking.voucher_balance_closed_at) {
    try {
      paid = await reconcileSummerBooking(db, { ...booking, id: id.data });
    } catch {
      // A delayed or unreachable Square response remains unconfirmed.
    }
  }

  const awaitingVoucher = booking.voucher_state && !booking.square_order_id && !paid;
  const voucherBalanceClosed = booking.voucher_balance_closed_at ||
    booking.clinic_dates.some((date: string) => date <= sydneyTodayIso());
  const cancelled = booking.status === "cancelled";
  return (
    <Section aria-label="Booking status">
      <h1 className="text-3xl font-bold">{paid ? "Booking confirmed" : cancelled ? "Booking hold expired" : awaitingVoucher ? "Voucher payment requested" : "Payment confirmation pending"}</h1>
      {summerParticipants(booking).map((child, index) => (
        <section key={index} className="my-4">
          <h2 className="font-semibold">Child {index + 1}</h2>
          <ul className="list-disc pl-6">
            {SUMMER_CLINICS.filter((clinic) => child.dates.includes(clinic.date)).map((clinic) => (
              <li key={clinic.date}>{formatSummerDate(clinic.date)} · {clinic.title} · {clinic.park}, {clinic.suburb}</li>
            ))}
          </ul>
        </section>
      ))}
      {cancelled && <Link href="/holiday-clinics/summer" className="underline">Choose dates again</Link>}
      {!paid && !cancelled && booking.voucher_state && (
        voucherBalanceClosed ? <p>Call 0426 722 003 to finalise this booking.</p> :
        booking.checkout_url ? <a className="underline" href={booking.checkout_url}>Pay remaining balance in Square</a> :
        <p>Call 0426 722 003 to arrange payment. Keep this page so you can check your booking or pay any balance.</p>
      )}
      {!paid && !cancelled && !booking.voucher_state && <p>Refresh to check again. If Square has already charged you, call 0426 722 003 before paying again.</p>}
    </Section>
  );
}
