// ============================================================
// Clinic helpers — pure + client-safe
// ============================================================
//
// Everything here is plain calendar/string maths shared by the
// server query layer (lib/marketing/clinics.ts) and the marketing
// UI — including the "use client" filters component, so this module
// MUST stay free of server-only imports (Supabase admin client,
// service-role env). Import from here in components; import from
// lib/marketing/clinics.ts only in server code that queries.

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

// ------------------------------------------------------------
// Display formatting — Sydney-safe by construction
// ------------------------------------------------------------
//
// A clinic's `date` (YYYY-MM-DD) IS the Sydney calendar date and its
// times are Sydney wall-clock, so formatting is pure calendar maths
// on the string parts. Never `new Date(dateString)` then format in
// server-local time: Vercel runs in bom1 (UTC+5:30) and would shift
// the day-of-week. Date.UTC + getUTC* keeps it timezone-free.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dateParts(dateIso: string): [number, number, number] {
  return [
    Number(dateIso.slice(0, 4)),
    Number(dateIso.slice(5, 7)),
    Number(dateIso.slice(8, 10)),
  ];
}

/** "2026-07-21" → "Tue 21 Jul". */
export function formatClinicDate(dateIso: string): string {
  const [y, m, d] = dateParts(dateIso);
  const weekday = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTH_NAMES[m - 1]}`;
}

/** "09:00:00" → "9am"; "15:30:00" → "3:30pm". */
export function formatClinicTime(time: string): string {
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** "09:00:00", "15:00:00" → "9am – 3pm". */
export function formatClinicTimeRange(start: string, end: string): string {
  return `${formatClinicTime(start)} – ${formatClinicTime(end)}`;
}

/** "Ages 5–12" / "Ages 5+" / "Ages up to 12"; null when unset. */
export function clinicAgeLabel(
  min: number | null,
  max: number | null
): string | null {
  if (min != null && max != null) return `Ages ${min}–${max}`;
  if (min != null) return `Ages ${min}+`;
  if (max != null) return `Ages up to ${max}`;
  return null;
}

/** 4500 → "$45.00" (en-AU currency formatting). */
export function formatClinicPrice(priceCents: number): string {
  return (priceCents / 100).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  });
}

/** ISO date of the Monday of the week containing `dateIso`. */
export function clinicWeekMondayIso(dateIso: string): string {
  const [y, m, d] = dateParts(dateIso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

/** "2026-07-22" → "Week of Mon 20 Jul" (its week's Monday). */
export function clinicWeekLabel(dateIso: string): string {
  return `Week of ${formatClinicDate(clinicWeekMondayIso(dateIso))}`;
}
