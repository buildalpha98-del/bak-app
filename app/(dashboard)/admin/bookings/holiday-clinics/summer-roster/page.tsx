import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled, summerParticipants, type SummerParticipant } from "@/lib/bookings/summer-clinics";

type RosterBooking = {
  id: string; clinic_dates: string[]; child_name: string; parent_email: string;
  booking_children: SummerParticipant[] | null; parent_name: string | null; parent_phone: string | null;
};

export default async function SummerRoster() {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await session.from("profiles").select("role, status").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active" || !summerClinicsEnabled()) notFound();

  const db = createSupabaseAdmin();
  const { data, error } = await db.from("summer_clinic_orders")
    .select("id,clinic_dates,child_name,parent_email,booking_children,parent_name,parent_phone").eq("status", "paid").order("child_name");
  if (error) return <p role="alert">Could not load the summer roster. Refresh to try again.</p>;
  const bookings: RosterBooking[] = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Summer clinic roster</h1>
      <Link className="underline" href="/admin/bookings/holiday-clinics/vouchers">Manage voucher requests</Link>
      {SUMMER_CLINICS.map((clinic) => {
        const attendees = bookings.flatMap((booking) => summerParticipants(booking)
          .flatMap((child, index) => child.dates.includes(clinic.date)
            ? [{ ...booking, attendeeKey: `${booking.id}-${index}`, name: child.name }] : []))
          .sort((a, b) => a.name.localeCompare(b.name));
        return (
          <section key={clinic.date} className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">{formatSummerDate(clinic.date)} · {clinic.title} · {clinic.suburb}</h2>
            <p>{attendees.length} of 100 confirmed</p>
            {attendees.length > 0 && (
              <ul className="mt-3 divide-y">
                {attendees.map(({ attendeeKey, name, parent_name, parent_email, parent_phone }) => (
                  <li key={attendeeKey} className="flex flex-wrap gap-x-4 py-2">
                    <span>{name}</span><span className="text-gray-600">{[parent_name, parent_email, parent_phone].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
