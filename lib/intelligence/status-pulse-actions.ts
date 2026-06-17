"use server";

// ============================================================
// Intelligence — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/intelligence.
// Four counts surface "what to look at first":
//
//   1. New centres this month       — `centres` rows whose
//      `created_at >= first day of current month`. Growth velocity.
//   2. Churn risks open             — distinct centres with at
//      least one `churn_risk_indicators` row whose `severity` is
//      'high' or 'critical' AND `resolved_at IS NULL`.
//   3. Low-utilisation coaches      — active coaches with < 30%
//      utilisation over the last 90 days (sessions / available slots).
//   4. New parents this month       — `parent_profiles` rows whose
//      `created_at >= first day of current month`.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface IntelligenceStatusPulse {
  newCentresThisMonthCount: number;
  openChurnRisksCount: number;
  lowUtilisationCoachesCount: number;
  newParentsThisMonthCount: number;
}

export async function getIntelligenceStatusPulse(): Promise<IntelligenceStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoff = ninetyDaysAgo.toISOString().slice(0, 10);

    const [newCentresRes, newParentsRes, churnRisksRes, coachesRes] =
      await Promise.all([
        supabase
          .from("centres")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStart),
        supabase
          .from("parent_profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStart),
        // Open high/critical risks — pull centre_ids, then count distinct.
        supabase
          .from("churn_risk_indicators")
          .select("centre_id")
          .in("severity", ["high", "critical"])
          .is("resolved_at", null),
        supabase
          .from("profiles")
          .select("id")
          .eq("role", "coach")
          .eq("status", "active"),
      ]);

    const openChurnRisksCount = new Set(
      (churnRisksRes.data ?? []).map((r) => (r as { centre_id: string }).centre_id),
    ).size;

    let lowUtilisationCoachesCount = 0;
    const coachIds = (coachesRes.data ?? []).map((r) => (r as { id: string }).id);

    if (coachIds.length > 0) {
      // Sessions per coach in window
      const { data: sessions } = await supabase
        .from("sessions")
        .select("coach_id")
        .gte("date", cutoff)
        .in("coach_id", coachIds);

      // Availability slots — assume 5/week if no rows
      const { data: availability } = await supabase
        .from("availability_slots")
        .select("coach_id, day_of_week")
        .in("coach_id", coachIds);

      const sessionsByCoach = new Map<string, number>();
      for (const s of sessions ?? []) {
        const cid = (s as { coach_id: string | null }).coach_id;
        if (!cid) continue;
        sessionsByCoach.set(cid, (sessionsByCoach.get(cid) ?? 0) + 1);
      }
      const slotsByCoach = new Map<string, number>();
      for (const a of availability ?? []) {
        const cid = (a as { coach_id: string }).coach_id;
        slotsByCoach.set(cid, (slotsByCoach.get(cid) ?? 0) + 1);
      }

      // 13 weeks in 90 days
      for (const id of coachIds) {
        const weekly = slotsByCoach.get(id) ?? 5;
        const total = weekly * 13;
        const sessions = sessionsByCoach.get(id) ?? 0;
        const utilisation = total > 0 ? (sessions / total) * 100 : 0;
        if (utilisation < 30) lowUtilisationCoachesCount += 1;
      }
    }

    return {
      newCentresThisMonthCount: newCentresRes.count ?? 0,
      openChurnRisksCount,
      lowUtilisationCoachesCount,
      newParentsThisMonthCount: newParentsRes.count ?? 0,
    };
  } catch (err) {
    console.error("getIntelligenceStatusPulse error:", err);
    return {
      newCentresThisMonthCount: 0,
      openChurnRisksCount: 0,
      lowUtilisationCoachesCount: 0,
      newParentsThisMonthCount: 0,
    };
  }
}
