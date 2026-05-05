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

export interface BulkCertPair {
  sessionId: string;
  coachId: string;
  sessionDate: string;
}

export interface BulkCertResult {
  /** Pairs whose coach passes the cert guard for the session date. */
  valid: BulkCertPair[];
  /** Pairs whose coach is blocked. Carries the per-pair guard result for messaging. */
  blocked: Array<BulkCertPair & { result: Extract<CertCheckResult, { ok: false }> }>;
}

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

/**
 * Many coaches × many sessions, each pair with its own date. Used by the
 * AI scheduling apply path (`POST /api/scheduling/generate` and
 * `publishSchedulingRun`) so a cert-invalid AI assignment can be
 * surfaced and skipped instead of silently written.
 *
 * One DB round-trip for compliance_docs across all involved coaches; the
 * per-pair guard runs in-memory.
 */
export async function bulkCheckCoachCertsForSessions(
  pairs: BulkCertPair[],
): Promise<BulkCertResult> {
  if (pairs.length === 0) return { valid: [], blocked: [] };

  const coachIds = Array.from(new Set(pairs.map((p) => p.coachId)));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("compliance_docs")
    .select("user_id, doc_type, expiry_date, status")
    .in("user_id", coachIds)
    .in("doc_type", [...BLOCKING_CERT_TYPES]);

  const certsByCoach = new Map<string, CertCheckInput[]>();
  if (!error && data) {
    for (const row of data as Array<{ user_id: string } & CertCheckInput>) {
      const list = certsByCoach.get(row.user_id) ?? [];
      list.push({
        doc_type: row.doc_type,
        expiry_date: row.expiry_date,
        status: row.status,
      });
      certsByCoach.set(row.user_id, list);
    }
  }

  const valid: BulkCertPair[] = [];
  const blocked: BulkCertResult["blocked"] = [];

  for (const pair of pairs) {
    const certs = certsByCoach.get(pair.coachId) ?? [];
    const result = assertCoachCertsValidForSession({
      certs,
      sessionDate: pair.sessionDate,
    });
    if (result.ok) {
      valid.push(pair);
    } else {
      blocked.push({ ...pair, result });
    }
  }

  return { valid, blocked };
}
