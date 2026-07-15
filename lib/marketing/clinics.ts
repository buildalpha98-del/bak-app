import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

export type PublicClinic = {
  id: string;
  title: string;
  sport: string | null;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  suburb: string;
  age_group_min: number | null;
  age_group_max: number | null;
  price_cents: number;
  max_capacity: number;
  current_bookings: number;
  booking_opens_at: string | null;
  booking_closes_at: string | null;
};

export function clinicAvailability(
  c: Pick<PublicClinic, "max_capacity" | "current_bookings">
) {
  const spotsLeft = Math.max(0, c.max_capacity - c.current_bookings);
  return {
    spotsLeft,
    soldOut: spotsLeft === 0,
    lowSpots: spotsLeft > 0 && spotsLeft <= 5,
  };
}

export function clinicIsListable(
  c: Pick<PublicClinic, "booking_opens_at" | "booking_closes_at">,
  now: Date
): boolean {
  if (c.booking_opens_at && new Date(c.booking_opens_at) > now) return false;
  if (c.booking_closes_at && new Date(c.booking_closes_at) <= now) return false;
  return true;
}

const PUBLIC_COLUMNS =
  "id, title, sport, date, start_time, end_time, location_name, suburb, age_group_min, age_group_max, price_cents, max_capacity, current_bookings, booking_opens_at, booking_closes_at";

export async function getOpenHolidayClinics(limit?: number): Promise<PublicClinic[]> {
  const supabase = createSupabaseAdmin();
  const today = sydneyTodayIso();
  let query = supabase
    .from("bookable_sessions")
    .select(PUBLIC_COLUMNS)
    .eq("status", "open")
    .eq("session_type", "holiday_clinic")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (limit) query = query.limit(limit * 2); // headroom: window filter may drop some
  const { data, error } = await query;
  if (error) throw error;
  const clinics = (data ?? []) as unknown as PublicClinic[];
  const now = new Date();
  const listable = clinics.filter((c) => clinicIsListable(c, now));
  return limit ? listable.slice(0, limit) : listable;
}
