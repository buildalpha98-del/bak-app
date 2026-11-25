import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Section } from "@/components/marketing/section";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { reconcileSummerBooking } from "@/lib/bookings/summer-reconciliation";

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
      paid = await reconcileSummerBooking(db, { ...booking, id: id.data });
    } catch {
      // A delayed or unreachable Square response remains unconfirmed.
    }
  }

  const cancelled = booking.status === "cancelled";
  return (
    <Section aria-label="Booking status">
      <h1 className="text-3xl font-bold">{paid ? "Booking confirmed" : cancelled ? "Booking hold expired" : "Payment confirmation pending"}</h1>
      <ul className="my-4 list-disc pl-6">
        {SUMMER_CLINICS.filter((clinic) => booking.clinic_dates.includes(clinic.date)).map((clinic) => (
          <li key={clinic.date}>{formatSummerDate(clinic.date)} · {clinic.title} · {clinic.park}, {clinic.suburb}</li>
        ))}
      </ul>
      {cancelled && <Link href="/holiday-clinics/summer" className="underline">Choose dates again</Link>}
      {!paid && !cancelled && <p>Refresh to check again. If Square has already charged you, call 0426 722 003 before paying again.</p>}
    </Section>
  );
}
