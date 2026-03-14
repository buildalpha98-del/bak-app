"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface VerifiedCoach {
  id: string;
  name: string;
  photo_url: string | null;
  date_of_birth: string | null;
  sports: string[];
  wwcc: {
    status: string;
    expiry_date: string | null;
    document_number?: string;
  } | null;
  firstAid: {
    status: string;
    expiry_date: string | null;
  } | null;
  sessionsAtCentre: number;
  lastSessionDate: string | null;
}

export async function getCentreCoaches(centreId: string): Promise<VerifiedCoach[]> {
  const supabase = await createSupabaseServerClient();

  // Get all coaches who have had sessions at this centre
  const { data: sessions } = await supabase
    .from("sessions")
    .select("coach_id, sport, date")
    .eq("centre_id", centreId)
    .not("coach_id", "is", null)
    .in("status", ["completed", "confirmed", "published", "pending_confirmation"]);

  if (!sessions || sessions.length === 0) return [];

  // Group by coach
  const coachMap: Record<string, { sports: Set<string>; count: number; lastDate: string }> = {};
  for (const s of sessions) {
    if (!s.coach_id) continue;
    if (!coachMap[s.coach_id]) {
      coachMap[s.coach_id] = { sports: new Set(), count: 0, lastDate: s.date };
    }
    coachMap[s.coach_id].sports.add(s.sport);
    coachMap[s.coach_id].count++;
    if (s.date > coachMap[s.coach_id].lastDate) {
      coachMap[s.coach_id].lastDate = s.date;
    }
  }

  const coachIds = Object.keys(coachMap);

  // Get profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, photo_url, date_of_birth")
    .in("id", coachIds);

  // Get compliance docs
  const { data: compDocs } = await supabase
    .from("compliance_docs")
    .select("coach_id, doc_type, status, expiry_date, document_number")
    .in("coach_id", coachIds)
    .in("doc_type", ["wwcc", "first_aid"]);

  // Build results
  const coaches: VerifiedCoach[] = [];
  for (const profile of profiles ?? []) {
    const info = coachMap[profile.id];
    if (!info) continue;

    const wwccDoc = compDocs?.find((d) => d.coach_id === profile.id && d.doc_type === "wwcc");
    const firstAidDoc = compDocs?.find((d) => d.coach_id === profile.id && d.doc_type === "first_aid");

    coaches.push({
      id: profile.id,
      name: profile.name,
      photo_url: profile.photo_url,
      date_of_birth: profile.date_of_birth,
      sports: Array.from(info.sports),
      wwcc: wwccDoc
        ? {
            status: wwccDoc.status,
            expiry_date: wwccDoc.expiry_date,
            document_number: wwccDoc.document_number
              ? `...${wwccDoc.document_number.slice(-4)}`
              : undefined,
          }
        : null,
      firstAid: firstAidDoc
        ? { status: firstAidDoc.status, expiry_date: firstAidDoc.expiry_date }
        : null,
      sessionsAtCentre: info.count,
      lastSessionDate: info.lastDate,
    });
  }

  return coaches.sort((a, b) => {
    const dateA = a.lastSessionDate ?? "";
    const dateB = b.lastSessionDate ?? "";
    return dateB.localeCompare(dateA);
  });
}
