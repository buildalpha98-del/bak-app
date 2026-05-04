import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertCoachCertsValidForSession,
  BLOCKING_CERT_TYPES,
  type CertCheckInput,
  type CertCheckResult,
} from "./cert-guard";

export type { CertCheckResult } from "./cert-guard";
export { assertCoachCertsValidForSession } from "./cert-guard";

/**
 * Fetch the coach's blocking compliance docs (wwcc, first_aid).
 * Returns an empty list if the coach has none — the guard treats
 * "no cert on file" as not-blocked (matches amana semantics; the
 * compliance dashboard surfaces missing rows separately).
 */
export async function fetchBlockingCertsForCoach(
  coachId: string,
): Promise<CertCheckInput[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("compliance_docs")
    .select("doc_type, expiry_date, status")
    .eq("user_id", coachId)
    .in("doc_type", [...BLOCKING_CERT_TYPES]);

  if (error || !data) return [];
  return data as CertCheckInput[];
}

/**
 * Convenience: fetch + check for a single session date.
 * Use this for non-bulk paths (createSession, single assign, swap accept).
 */
export async function checkCoachCertsForSession(
  coachId: string,
  sessionDate: string,
): Promise<CertCheckResult> {
  const certs = await fetchBlockingCertsForCoach(coachId);
  return assertCoachCertsValidForSession({ certs, sessionDate });
}

/**
 * Convenience: one fetch, many dates. Returns the first blocking
 * result (with the offending date appended to the message), otherwise ok.
 * Used by bulkReassignCoach.
 */
export async function checkCoachCertsForSessionDates(
  coachId: string,
  sessionDates: string[],
): Promise<CertCheckResult> {
  if (sessionDates.length === 0) return { ok: true };
  const certs = await fetchBlockingCertsForCoach(coachId);
  for (const date of sessionDates) {
    const result = assertCoachCertsValidForSession({ certs, sessionDate: date });
    if (!result.ok) {
      return {
        ...result,
        message: `${result.message} (blocked on ${date})`,
      };
    }
  }
  return { ok: true };
}
