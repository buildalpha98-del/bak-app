import { notFound, redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled } from "@/lib/bookings/summer-clinics";

type RosterBooking = { id: string; clinic_dates: string[]; child_name: string; parent_email: string };

export default async function SummerRoster() {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await session.from("profiles").select("role, status").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.status !== "active" || !summerClinicsEnabled()) notFound();

  const db = createSupabaseAdmin();
  const { data, error } = await db.from("summer_clinic_orders")
    .select("id,clinic_dates,child_name,parent_email").eq("status", "paid").order("child_name");
  if (error) return <p role="alert">Could not load the summer roster. Refresh to try again.</p>;
  const bookings: RosterBooking[] = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Summer clinic roster</h1>
      {SUMMER_CLINICS.map((clinic) => {
        const attendees = bookings.filter((booking) => booking.clinic_dates.includes(clinic.date));
        return (
          <section key={clinic.date} className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">{formatSummerDate(clinic.date)} · {clinic.title} · {clinic.suburb}</h2>
            <p>{attendees.length} of 100 confirmed</p>
            {attendees.length > 0 && (
              <ul className="mt-3 divide-y">
                {attendees.map(({ id, child_name, parent_email }) => (
                  <li key={id} className="flex flex-wrap gap-x-4 py-2">
                    <span>{child_name}</span><span className="text-gray-600">{parent_email}</span>
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
