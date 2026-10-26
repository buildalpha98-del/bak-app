"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { centreColour } from "@/lib/utils/centre-colours";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import {
  buildMonthBookings,
  isMonthKey,
  monthBounds,
  type MonthBookings,
  type MonthCentre,
  type MonthSession,
} from "./month-bookings-model";

/**
 * One month of centre & school bookings for the month page
 * (`/{admin,ops}/roster/month`). Admin and ops only. The per-session
 * rate is read only for viewers with financial access — everyone else
 * gets the same page with no dollar figures (value stays null).
 */
export async function getMonthBookings(month?: string | null): Promise<{
  data: { bookings: MonthBookings; financialAccess: boolean } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { data: null, error: "Only admin and operations can view monthly bookings." };
    }

    const key = isMonthKey(month) ? month : sydneyTodayIso().slice(0, 7);
    const { first, last } = monthBounds(key);
    const financialAccess = await getFinancialAccess();

    const [{ data: centreRows, error: centreErr }, { data: sessionRows, error: sessionErr }] = await Promise.all([
      supabase
        .from("centres")
        .select(`id, name, type, colour, contract_status${financialAccess ? ", agreed_rate" : ""}`)
        .order("name"),
      supabase
        .from("sessions")
        .select(
          "id, centre_id, date, time, duration_minutes, sport, status, is_trial, profiles:coach_id(name), session_coaches(user_id)",
        )
        .gte("date", first)
        .lte("date", last)
        .order("date")
        .order("time"),
    ]);
    // Throw rather than read `data ?? []`: a refused query must not look
    // like a month with no bookings.
    if (centreErr) throw centreErr;
    if (sessionErr) throw sessionErr;

    const centres: MonthCentre[] = ((centreRows ?? []) as unknown as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      type: c.type as string,
      colour: centreColour({ id: c.id as string, colour: c.colour as string | null }),
      contract_status: c.contract_status as string,
      agreed_rate: financialAccess && c.agreed_rate != null ? Number(c.agreed_rate) : null,
    }));

    const sessions: MonthSession[] = ((sessionRows ?? []) as unknown as Array<Record<string, unknown>>).map((s) => {
      const crew = (s.session_coaches as unknown[] | null) ?? [];
      const primary = s.profiles as { name: string | null } | null;
      return {
        id: s.id as string,
        centre_id: s.centre_id as string,
        date: s.date as string,
        time: s.time as string,
        duration_minutes: Number(s.duration_minutes) || 0,
        sport: (s.sport as string) ?? "",
        status: s.status as string,
        is_trial: !!s.is_trial,
        coach_name: primary?.name ?? null,
        // session_coaches is the source of truth; coach_id is its cache.
        coach_count: crew.length || (primary ? 1 : 0),
      };
    });

    return { data: { bookings: buildMonthBookings(key, centres, sessions), financialAccess }, error: null };
  } catch (err) {
    console.error("getMonthBookings error:", err);
    return { data: null, error: "Failed to load this month's bookings." };
  }
}
