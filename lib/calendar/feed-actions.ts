"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "./ics";

/**
 * Build event lists for the .ics feed endpoints.
 *
 * Each function:
 *  - Queries through the user's Supabase server client (so RLS still applies).
 *  - Defaults to a window of `now - 4 weeks` to `now + 8 weeks` — enough to
 *    cover this term and most of next without bloating the feed past what a
 *    phone wants to sync.
 *  - Skips cancelled sessions / bookings.
 */

const APP_ORIGIN = "https://buildalphakids.app";

export interface CalendarRange {
  start: Date;
  end: Date;
}

function defaultRange(): CalendarRange {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 28); // 4 weeks back
  const end = new Date(now);
  end.setDate(end.getDate() + 56); // 8 weeks forward
  return { start, end };
}

function toDateOnly(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Combine a `YYYY-MM-DD` date with a `HH:mm` or `HH:mm:ss` time into a Date.
 * The resulting Date represents that wall-clock moment in Sydney local time —
 * we encode it as a UTC instant by tagging the ISO string with `+10:00` (AEST)
 * or `+11:00` (AEDT) based on a simple DST window check.
 *
 * Sydney DST: starts first Sunday of October, ends first Sunday of April.
 */
function combineDateTimeSydney(dateStr: string, timeStr: string): Date {
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  // Probe: parse as if UTC, then check Sydney offset for that wall date.
  const probe = new Date(`${dateStr}T${time}Z`);
  const offset = sydneyOffsetMinutes(probe);
  // Build an ISO string with the explicit offset so JS knows the UTC moment.
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = Math.floor(abs / 60).toString().padStart(2, "0");
  const mm = (abs % 60).toString().padStart(2, "0");
  return new Date(`${dateStr}T${time}${sign}${hh}:${mm}`);
}

/**
 * Sydney UTC offset for a given moment, in minutes.
 *
 * Conservative DST window: AEDT (UTC+11) Oct 1 → April 1. The exact transition
 * (first Sunday at 02:00) shifts by a few days year-to-year — we accept up to
 * a few days of imprecision around the edges because the .ics output uses
 * TZID=Australia/Sydney which lets the calendar client apply its own zone.
 */
function sydneyOffsetMinutes(date: Date): number {
  // Use Intl to fetch the actual offset — most accurate, no hand-rolled DST.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    timeZoneName: "shortOffset",
  });
  const parts = dtf.formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  // tzName looks like "GMT+10" or "GMT+11" (or "GMT+10:30" in fringe cases).
  const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 600; // Default AEST as a sane fallback.
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2] ?? "0", 10);
  const mins = parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + mins);
}

function endOfSession(
  dateStr: string,
  timeStr: string,
  durationMin: number,
): Date {
  const start = combineDateTimeSydney(dateStr, timeStr);
  return new Date(start.getTime() + durationMin * 60 * 1000);
}

// ============================================================
// 1. Coach events
// ============================================================

interface CoachSessionRow {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  sport: string;
  status: string;
  notes: string | null;
  programs: { title: string | null } | null;
  centres: { name: string | null; address: string | null } | null;
}

export async function getCoachEvents(
  coachId: string,
  range?: CalendarRange,
): Promise<CalendarEvent[]> {
  const { start, end } = range ?? defaultRange();
  const supabase = await createSupabaseServerClient();

  // Pull every session where this coach is in `session_coaches`. Joining
  // through the join table covers both primary and secondary assignments
  // (P5 multi-coach contract).
  const { data, error } = await supabase
    .from("session_coaches")
    .select(
      "sessions:session_id(id, date, time, duration_minutes, sport, status, notes, programs:program_id(title), centres:centre_id(name, address))",
    )
    .eq("user_id", coachId);

  if (error || !data) return [];

  // Supabase's generated typings model joined relations as arrays; in practice
  // a single FK relation returns either an object or `null` at runtime.
  // We accept both shapes here and normalise via `unknown`.
  const rows = (data as unknown as Array<{
    sessions: CoachSessionRow | CoachSessionRow[] | null;
  }>) ?? [];

  return rows
    .map((r) => (Array.isArray(r.sessions) ? r.sessions[0] : r.sessions))
    .filter((s): s is CoachSessionRow => Boolean(s))
    .filter((s) => s.status !== "cancelled")
    .filter((s) => {
      const startDate = combineDateTimeSydney(s.date, s.time);
      return startDate >= start && startDate <= end;
    })
    .map((s) => {
      const startDate = combineDateTimeSydney(s.date, s.time);
      const endDate = endOfSession(s.date, s.time, s.duration_minutes);
      const centreName = s.centres?.name ?? "Unknown centre";
      const programTitle = s.programs?.title ?? null;
      const descLines = [
        programTitle ? `Programme: ${programTitle}` : null,
        `Duration: ${s.duration_minutes} min`,
        s.notes ? `Notes: ${s.notes}` : null,
      ].filter((l): l is string => Boolean(l));
      return {
        uid: `session-${s.id}`,
        start: startDate,
        end: endDate,
        summary: `${s.sport} at ${centreName}`,
        description: descLines.join("\n"),
        location: s.centres?.address ?? centreName,
        url: `${APP_ORIGIN}/coach/schedule?session=${s.id}`,
      };
    });
}

// ============================================================
// 2. Parent events
// ============================================================

interface ParentBookingRow {
  id: string;
  status: string;
  bookable_sessions: {
    id: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    sport: string | null;
    location_name: string | null;
    location_address: string | null;
  } | null;
  children_json: Array<{ child_name: string }> | null;
}

export async function getParentEvents(
  parentId: string,
  range?: CalendarRange,
): Promise<CalendarEvent[]> {
  const { start, end } = range ?? defaultRange();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, children_json, bookable_sessions:bookable_session_id(id, title, date, start_time, end_time, sport, location_name, location_address)",
    )
    .eq("parent_id", parentId)
    .neq("status", "cancelled")
    .gte("bookable_sessions.date", toDateOnly(start))
    .lte("bookable_sessions.date", toDateOnly(end));

  if (error || !data) return [];

  const rows = data as unknown as ParentBookingRow[];

  return rows
    .filter((r) => r.bookable_sessions !== null)
    .map((r) => {
      const session = r.bookable_sessions!;
      const startDate = combineDateTimeSydney(session.date, session.start_time);
      const endDate = combineDateTimeSydney(session.date, session.end_time);
      const childNames = (r.children_json ?? [])
        .map((c) => c.child_name)
        .filter(Boolean)
        .join(", ");
      const summary = childNames
        ? `${childNames}: ${session.sport ?? session.title}`
        : session.title;
      const locName = session.location_name ?? "";
      const locAddr = session.location_address ?? "";
      const location = [locName, locAddr].filter(Boolean).join(", ") || locName;
      return {
        uid: `booking-${r.id}`,
        start: startDate,
        end: endDate,
        summary,
        description: session.title,
        location,
        url: `${APP_ORIGIN}/parent/bookings`,
      };
    });
}

// ============================================================
// 3. Centre events
// ============================================================

interface CentreSessionRow {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  sport: string;
  status: string;
  profiles: { name: string | null } | null;
  centres: { name: string | null; address: string | null } | null;
}

export async function getCentreEvents(
  centreId: string,
  range?: CalendarRange,
): Promise<CalendarEvent[]> {
  const { start, end } = range ?? defaultRange();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, date, time, duration_minutes, sport, status, profiles:coach_id(name), centres:centre_id(name, address)",
    )
    .eq("centre_id", centreId)
    .neq("status", "cancelled")
    .gte("date", toDateOnly(start))
    .lte("date", toDateOnly(end));

  if (error || !data) return [];

  const rows = data as unknown as CentreSessionRow[];

  return rows.map((s) => {
    const startDate = combineDateTimeSydney(s.date, s.time);
    const endDate = endOfSession(s.date, s.time, s.duration_minutes);
    const coachName = s.profiles?.name ?? "Coach TBD";
    const centreName = s.centres?.name ?? "Build Alpha Kids";
    return {
      uid: `session-${s.id}`,
      start: startDate,
      end: endDate,
      summary: `${s.sport} (${coachName})`,
      description: `Sport: ${s.sport}\nCoach: ${coachName}`,
      location: s.centres?.address ?? centreName,
      url: `${APP_ORIGIN}/client/${centreId}`,
    };
  });
}
