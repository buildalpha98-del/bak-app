"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateICalFeed(centreId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: centre } = await supabase
    .from("centres")
    .select("name")
    .eq("id", centreId)
    .single();

  const now = new Date().toISOString().slice(0, 10);
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, sport, status, profiles!sessions_coach_id_fkey(name)")
    .eq("centre_id", centreId)
    .not("status", "in", '("cancelled","draft")')
    .gte("date", now)
    .lte("date", threeMonths.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const centreName = centre?.name ?? "Build Alpha Kids";

  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Build Alpha Kids//Sports Coaching//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${centreName} — BAK Sports
X-WR-TIMEZONE:Australia/Sydney
`;

  for (const session of sessions ?? []) {
    const coach = (session as any).profiles?.name ?? "TBC";
    const startDt = `${session.date.replace(/-/g, "")}T${session.time.replace(/:/g, "")}00`;
    const startDate = new Date(`${session.date}T${session.time}`);
    const endDate = new Date(startDate.getTime() + session.duration_minutes * 60000);
    const endDt = endDate.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");

    ical += `BEGIN:VEVENT
UID:${session.id}@buildalphakids.com.au
DTSTART;TZID=Australia/Sydney:${startDt}
DTEND;TZID=Australia/Sydney:${endDt}
SUMMARY:${session.sport} — Build Alpha Kids
DESCRIPTION:Coach: ${coach}\\nSport: ${session.sport}\\nDuration: ${session.duration_minutes}min
STATUS:${session.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}
END:VEVENT
`;
  }

  ical += "END:VCALENDAR";
  return ical;
}
