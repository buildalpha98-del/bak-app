"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolvePayRate,
  calculateSessionPay,
  type PayRateRecord,
} from "@/lib/utils/payRates";
import {
  projectWeekCost,
  type CostProjection,
  type PricedSession,
} from "@/lib/utils/roster/cost-projection";
import type { CentreType } from "@/lib/types/enums";

export type { CostProjection } from "@/lib/utils/roster/cost-projection";

interface SessionRow {
  id: string;
  date: string;
  duration_minutes: number;
  coach_id: string | null;
  centre_id: string;
  pay_rate_override: number | null;
  status: string;
  profiles: { name: string } | null;
}

const COSTABLE_STATUSES = new Set([
  "draft",
  "published",
  "pending_confirmation",
  "confirmed",
  "in_progress",
  "completed",
]);

/**
 * Project the wage cost of an entire week's roster (Mon → Sun by default).
 * Used by the WeekCostChip above the weekly grid.
 *
 * Cancelled and needs_replacement sessions are excluded — they won't
 * cost anything once the rerostering flow concludes.
 */
export async function getWeekCostProjection(
  weekStartDate: string,
  weekDays = 7,
): Promise<{ data: CostProjection | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const start = new Date(weekStartDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + (weekDays - 1));
    const weekEndDate = end.toISOString().split("T")[0];

    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select(
        "id, date, duration_minutes, coach_id, centre_id, pay_rate_override, status, profiles:coach_id(name)",
      )
      .gte("date", weekStartDate)
      .lte("date", weekEndDate);

    if (sessErr) throw sessErr;

    const rows = ((sessions ?? []) as unknown as SessionRow[]).filter((r) =>
      COSTABLE_STATUSES.has(r.status),
    );

    if (rows.length === 0) {
      return { data: projectWeekCost([]), error: null };
    }

    const coachIds = Array.from(
      new Set(rows.map((r) => r.coach_id).filter((id): id is string => !!id)),
    );
    const centreIds = Array.from(new Set(rows.map((r) => r.centre_id)));

    const [ratesRes, profilesRes, centresRes] = await Promise.all([
      coachIds.length > 0
        ? supabase
            .from("pay_rates")
            .select("user_id, session_type, rate, rate_unit, effective_from")
            .in("user_id", coachIds)
        : Promise.resolve({ data: [], error: null }),
      coachIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, default_pay_rate")
            .in("id", coachIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("centres").select("id, type").in("id", centreIds),
    ]);

    if (ratesRes.error) throw ratesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (centresRes.error) throw centresRes.error;

    const ratesByCoach = new Map<string, PayRateRecord[]>();
    for (const r of (ratesRes.data ?? []) as Array<
      PayRateRecord & { user_id: string }
    >) {
      const list = ratesByCoach.get(r.user_id) ?? [];
      list.push({
        session_type: r.session_type,
        rate: r.rate,
        rate_unit: r.rate_unit,
        effective_from: r.effective_from,
      });
      ratesByCoach.set(r.user_id, list);
    }

    const profileById = new Map(
      ((profilesRes.data ?? []) as Array<{
        id: string;
        default_pay_rate: number | null;
      }>).map((p) => [p.id, { default_pay_rate: p.default_pay_rate }]),
    );

    const centreTypeById = new Map(
      ((centresRes.data ?? []) as Array<{ id: string; type: CentreType }>).map(
        (c) => [c.id, c.type],
      ),
    );

    const priced: PricedSession[] = rows.map((r) => {
      let amount: number | null = null;
      if (r.coach_id) {
        const resolved = resolvePayRate(
          {
            pay_rate_override: r.pay_rate_override,
            coach_id: r.coach_id,
            duration_minutes: r.duration_minutes,
            centre_type:
              centreTypeById.get(r.centre_id) ?? "childcare_centre",
          },
          ratesByCoach.get(r.coach_id) ?? [],
          profileById.get(r.coach_id) ?? null,
          r.date,
        );
        if (resolved) {
          amount = calculateSessionPay(resolved, r.duration_minutes).amount;
        }
      }

      return {
        sessionId: r.id,
        coachId: r.coach_id,
        coachName: r.profiles?.name ?? null,
        durationMinutes: r.duration_minutes,
        amount,
      };
    });

    return { data: projectWeekCost(priced), error: null };
  } catch (err) {
    console.error("getWeekCostProjection error:", err);
    return { data: null, error: "Failed to project roster cost." };
  }
}
