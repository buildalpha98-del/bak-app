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
import { toLocalIso } from "@/lib/utils/roster";

// (No type re-exports in "use server" modules — import CostProjection
// from @/lib/utils/roster/cost-projection.)

interface SessionRow {
  id: string;
  date: string;
  duration_minutes: number;
  coach_id: string | null;
  centre_id: string;
  pay_rate_override: number | null;
  status: string;
  profiles: { name: string } | null;
  /**
   * P5: every assigned coach on the shift (primary first). Drives the
   * per-coach fan-out below. A multi-coach shift produces N priced
   * rows so the chip's labour figure reflects coach-hours, not
   * shift-hours.
   */
  session_coaches: Array<{
    user_id: string;
    is_primary: boolean;
    profiles: { name: string | null } | null;
  }> | null;
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

    // Financial-access gate — hide wage projections from ops users
    // without the financial_access flag. Returning null (rather than
    // an error) lets the WeekCostChip silently skip rendering instead
    // of surfacing a confusing toast.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: actor } = await supabase
      .from("profiles")
      .select("financial_access")
      .eq("id", user.id)
      .single();
    if (!actor?.financial_access) {
      return { data: null, error: null };
    }

    const start = new Date(weekStartDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + (weekDays - 1));
    const weekEndDate = toLocalIso(end);

    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select(
        "id, date, duration_minutes, coach_id, centre_id, pay_rate_override, status, profiles:coach_id(name), session_coaches(user_id, is_primary, profiles:user_id(name))",
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

    // P5: derive coachIds from `session_coaches` so rate/profile
    // lookups cover every assigned coach, not just the primary on the
    // legacy `sessions.coach_id` column. Secondary coaches need their
    // own resolved rate for the per-coach fan-out below.
    const coachIds = Array.from(
      new Set(
        rows.flatMap((r) =>
          (r.session_coaches ?? []).map((c) => c.user_id),
        ),
      ),
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

    // P5 per-coach fan-out (spec §10 Decision E, per-rate-summed):
    // a multi-coach shift produces one priced row per assigned coach,
    // each priced at that coach's resolved rate. Unassigned shifts
    // emit a single null-coach row so the `unassignedSessions` count
    // in the aggregator stays correct.
    const priced: PricedSession[] = rows.flatMap((r): PricedSession[] => {
      const assigned = r.session_coaches ?? [];
      if (assigned.length === 0) {
        return [{
          sessionId: r.id,
          coachId: null,
          coachName: null,
          durationMinutes: r.duration_minutes,
          amount: null,
        }];
      }
      return assigned.map((c): PricedSession => {
        let amount: number | null = null;
        const resolved = resolvePayRate(
          {
            // pay_rate_override applies only to the primary — it's a
            // session-level override of the primary's rate, not a
            // per-secondary override. Spec §10 Decision E intentionally
            // keeps secondary coaches on their resolved rate.
            pay_rate_override: c.is_primary ? r.pay_rate_override : null,
            coach_id: c.user_id,
            duration_minutes: r.duration_minutes,
            centre_type:
              centreTypeById.get(r.centre_id) ?? "childcare_centre",
          },
          ratesByCoach.get(c.user_id) ?? [],
          profileById.get(c.user_id) ?? null,
          r.date,
        );
        if (resolved) {
          amount = calculateSessionPay(resolved, r.duration_minutes).amount;
        }
        return {
          sessionId: r.id,
          coachId: c.user_id,
          coachName: c.profiles?.name ?? null,
          durationMinutes: r.duration_minutes,
          amount,
        };
      });
    });

    return { data: projectWeekCost(priced), error: null };
  } catch (err) {
    console.error("getWeekCostProjection error:", err);
    return { data: null, error: "Failed to project roster cost." };
  }
}
