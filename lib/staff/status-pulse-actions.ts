"use server";

// ============================================================
// Staff list — status pulse server action
// ============================================================
//
// Powers the inline "N expired certs · M pending verifications ·
// K not rostered this week · F onboarding" strip above the staff
// list. Each count is a link-to-jump that flips a query param on
// the list view so the operator can drill into the work.
//
// Implementation notes:
//   - Uses `head: true` count queries where possible to avoid
//     hauling rows back across the wire for a pure aggregate.
//   - "Not rostered this week" is the only count that has to do
//     real client-side aggregation — we pull active-coach ids and
//     the Mon–Fri sessions for the current week, then subtract.
//   - "Pending verifications" includes any compliance_doc whose
//     status is `pending` — that's the operational definition the
//     ops team uses today; once they begin uploading docs we'll
//     refine to "needs_review" or similar.
//   - Errors swallow to zeros so a single broken query doesn't
//     blank the whole page; the centres pulse uses the same
//     forgive-and-return-zeros pattern.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday, getFriday } from "@/lib/utils/roster";

export interface StaffStatusPulse {
  expiredCertsCount: number;
  pendingVerificationsCount: number;
  notRosteredThisWeekCount: number;
  onboardingCount: number;
}

export async function getStaffStatusPulse(): Promise<StaffStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    // ============================================================
    // Mon–Fri window for "not rostered this week"
    // ============================================================
    const monday = getMonday(new Date());
    const friday = getFriday(monday);
    const mondayIso = monday.toISOString().split("T")[0];
    const fridayIso = friday.toISOString().split("T")[0];

    // ============================================================
    // Fan out the four queries in parallel.
    //
    // 1. Expired certs:    compliance_docs.expiry_date < today
    //                      AND the parent profile is `status='active'`.
    //                      We can't `head:true` here because we need to
    //                      join through profile.status — so pull the
    //                      user_id list and filter against active coaches.
    // 2. Pending verifications: compliance_docs.status='pending' — flat
    //                      head count.
    // 3. Active coaches:   needed to compute (#1) AND (#3) so we read
    //                      a single list of active coach ids once.
    // 4. Onboarding:       profiles.status='onboarding' — flat head count.
    // ============================================================

    const todayIso = new Date().toISOString().split("T")[0];

    const [activeCoachesRes, expiredDocsRes, pendingRes, onboardingRes, weekSessionsRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, role")
          .eq("status", "active"),
        // Don't head:true — we need user_ids to cross-check active status.
        supabase
          .from("compliance_docs")
          .select("user_id, expiry_date")
          .lt("expiry_date", todayIso)
          .not("expiry_date", "is", null),
        supabase
          .from("compliance_docs")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "onboarding"),
        // sessions.coach_id is the trigger-maintained primary cache; safe to
        // read for "is this coach rostered". We restrict to Mon–Fri of the
        // current week and exclude cancelled rows.
        supabase
          .from("sessions")
          .select("coach_id")
          .gte("date", mondayIso)
          .lte("date", fridayIso)
          .neq("status", "cancelled")
          .not("coach_id", "is", null),
      ]);

    const activeProfiles = activeCoachesRes.data ?? [];
    const activeIdSet = new Set<string>(
      activeProfiles.map((p: { id: string }) => p.id)
    );
    // Active *coaches* only — admins/ops aren't rostered, so excluding
    // them from the "not rostered" denominator keeps the count honest.
    const activeCoachIdSet = new Set<string>(
      activeProfiles
        .filter((p: { role: string }) => p.role === "coach")
        .map((p: { id: string }) => p.id)
    );

    // (1) Expired certs — only count rows whose parent profile is active.
    let expiredCertsCount = 0;
    for (const doc of expiredDocsRes.data ?? []) {
      if (activeIdSet.has((doc as { user_id: string }).user_id)) {
        expiredCertsCount += 1;
      }
    }

    // (3) Not rostered this week — active coaches with zero week sessions.
    const rosteredIds = new Set<string>();
    for (const s of weekSessionsRes.data ?? []) {
      const coachId = (s as { coach_id: string | null }).coach_id;
      if (coachId) rosteredIds.add(coachId);
    }
    let notRosteredThisWeekCount = 0;
    for (const id of activeCoachIdSet) {
      if (!rosteredIds.has(id)) notRosteredThisWeekCount += 1;
    }

    return {
      expiredCertsCount,
      pendingVerificationsCount: pendingRes.count ?? 0,
      notRosteredThisWeekCount,
      onboardingCount: onboardingRes.count ?? 0,
    };
  } catch (err) {
    console.error("getStaffStatusPulse error:", err);
    return {
      expiredCertsCount: 0,
      pendingVerificationsCount: 0,
      notRosteredThisWeekCount: 0,
      onboardingCount: 0,
    };
  }
}
