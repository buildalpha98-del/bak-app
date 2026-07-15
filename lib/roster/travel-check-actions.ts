"use server";

// ============================================================
// Travel pre-flight — warn on tight legs when assigning manually
// ============================================================
//
// The AI solver enforces travel buffers as a hard constraint, but
// manual assigns/swaps bypassed it entirely: an operator could give a
// coach back-to-back sessions at centres 40 minutes apart. This check
// runs AFTER a manual assignment and returns warnings (never blocks —
// the operator may know a shortcut we don't).

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { estimatedTravelMinutes } from "@/lib/utils/scheduling/travel";

export interface TravelWarning {
  coachName: string;
  otherCentre: string;
  /** Minutes between the two sessions (negative = they overlap). */
  gapMinutes: number;
  /** Estimated minutes needed to drive between the two centres. */
  requiredMinutes: number;
  direction: "before" | "after";
}

interface CentreGeo {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export async function checkCoachTravelWarnings(
  coachIds: string[],
  sessionId: string
): Promise<{ data: TravelWarning[]; error: string | null }> {
  try {
    if (coachIds.length === 0) return { data: [], error: null };
    const supabase = await createSupabaseServerClient();

    const { data: target } = await supabase
      .from("sessions")
      .select(
        "id, date, time, duration_minutes, centre_id, centres(name, latitude, longitude)"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (!target) return { data: [], error: "Session not found." };

    const targetCentre = target.centres as unknown as CentreGeo | null;
    const targetStart = toMinutes(target.time);
    const targetEnd = targetStart + (target.duration_minutes ?? 60);

    const [{ data: rows }, { data: coaches }] = await Promise.all([
      supabase
        .from("session_coaches")
        .select(
          "coach_id, sessions!inner(id, date, time, duration_minutes, centre_id, status, centres(name, latitude, longitude))"
        )
        .in("coach_id", coachIds)
        .eq("sessions.date", target.date),
      supabase.from("profiles").select("id, name").in("id", coachIds),
    ]);

    const nameOf = new Map(
      (coaches ?? []).map((c) => [c.id as string, (c.name as string) ?? "Coach"])
    );

    const warnings: TravelWarning[] = [];
    for (const coachId of coachIds) {
      const days = (rows ?? [])
        .filter((r) => r.coach_id === coachId)
        .map((r) => r.sessions as unknown as {
          id: string;
          time: string;
          duration_minutes: number | null;
          centre_id: string;
          status: string;
          centres: CentreGeo | null;
        })
        .filter(
          (s) =>
            s.id !== target.id &&
            s.centre_id !== target.centre_id &&
            !["cancelled", "needs_replacement"].includes(s.status)
        );

      for (const s of days) {
        const start = toMinutes(s.time);
        const end = start + (s.duration_minutes ?? 60);
        const required = Math.round(
          estimatedTravelMinutes(
            targetCentre ?? { latitude: null, longitude: null, name: "" },
            s.centres ?? { latitude: null, longitude: null, name: "" }
          )
        );

        // Session ending before the target starts → travel TO target.
        if (end <= targetStart && targetStart - end < required) {
          warnings.push({
            coachName: nameOf.get(coachId) ?? "Coach",
            otherCentre: s.centres?.name ?? "another centre",
            gapMinutes: targetStart - end,
            requiredMinutes: required,
            direction: "before",
          });
        }
        // Session starting after the target ends → travel FROM target.
        if (start >= targetEnd && start - targetEnd < required) {
          warnings.push({
            coachName: nameOf.get(coachId) ?? "Coach",
            otherCentre: s.centres?.name ?? "another centre",
            gapMinutes: start - targetEnd,
            requiredMinutes: required,
            direction: "after",
          });
        }
        // Overlap with a different-centre session.
        if (start < targetEnd && end > targetStart) {
          warnings.push({
            coachName: nameOf.get(coachId) ?? "Coach",
            otherCentre: s.centres?.name ?? "another centre",
            gapMinutes: -(Math.min(targetEnd, end) - Math.max(targetStart, start)),
            requiredMinutes: required,
            direction: start < targetStart ? "before" : "after",
          });
        }
      }
    }

    return { data: warnings, error: null };
  } catch (err) {
    console.error("checkCoachTravelWarnings error:", err);
    return { data: [], error: null };
  }
}
