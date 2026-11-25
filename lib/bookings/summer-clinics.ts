export const SUMMER_CLINICS = [
  { date: "2026-12-22", title: "Colour Run", suburb: "Casula", park: "Peter Miller Park", towel: false },
  { date: "2026-12-24", title: "Water Games", suburb: "Auburn", park: "Peter Hislop Park", towel: true },
  { date: "2027-01-05", title: "Ninja Warrior", suburb: "Casula", park: "Peter Miller Park", towel: false },
  { date: "2027-01-07", title: "Mini Olympics", suburb: "Auburn", park: "Peter Hislop Park", towel: false },
  { date: "2027-01-12", title: "Wild West", suburb: "Casula", park: "Peter Miller Park", towel: false },
  { date: "2027-01-14", title: "Foam Party", suburb: "Auburn", park: "Peter Hislop Park", towel: true },
] as const;

export function formatSummerDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney",
  }).format(new Date(date));
}

export function summerClinicsEnabled() {
  if (process.env.BAK_SUMMER_CLINICS_ENABLED !== "true" ||
    !process.env.SQUARE_LOCATION_ID || !process.env.SQUARE_ACCESS_TOKEN ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.BAK_SUMMER_CHECKOUT_ORIGIN) return false;

  if (process.env.VERCEL_ENV === "production") {
    return process.env.BAK_SUMMER_CHECKOUT_ORIGIN === "https://buildalphakids.com.au" &&
      Boolean(process.env.CRON_SECRET);
  }

  return process.env.SQUARE_ENV === "sandbox";
}

export type SummerParticipant = { name: string; dates: string[] };

export function summerParticipants(booking: {
  booking_children: SummerParticipant[] | null;
  child_name: string;
  clinic_dates: string[];
}): SummerParticipant[] {
  return booking.booking_children ?? [{ name: booking.child_name, dates: booking.clinic_dates }];
}
