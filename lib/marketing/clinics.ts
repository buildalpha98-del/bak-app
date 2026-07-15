// ============================================================
// Public clinic query layer — SERVER ONLY
// ============================================================
//
// Uses the service-role Supabase client, so never import this from
// a "use client" component. The pure helpers (availability, booking
// window, display formatting) live in ./clinics-shared and are
// re-exported here so server callers keep a single import.

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { clinicIsListable, type PublicClinic } from "./clinics-shared";

export {
  clinicAvailability,
  clinicIsListable,
} from "./clinics-shared";
export type { PublicClinic } from "./clinics-shared";

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
