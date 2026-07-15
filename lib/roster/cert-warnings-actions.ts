"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertCoachCertsValidForSession,
  BLOCKING_CERT_TYPES,
  type CertCheckInput,
} from "@/lib/utils/compliance/cert-guard";
import type {
  ExpiringCert,
  SessionCertWarning,
} from "@/lib/utils/compliance/cert-warnings";
import { toLocalIso } from "@/lib/utils/roster";

const EXPIRING_WINDOW_DAYS = 14;

function dateDeltaDays(later: string, earlier: string): number {
  const a = Date.UTC(
    Number(later.slice(0, 4)),
    Number(later.slice(5, 7)) - 1,
    Number(later.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(earlier.slice(0, 4)),
    Number(earlier.slice(5, 7)) - 1,
    Number(earlier.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

/**
 * Per-session cert warnings across a week.
 *
 * Returned as a plain object (not a Map) so it serialises across the
 * server-component → client-component boundary. Sessions with no
 * issues are omitted — caller should treat the absence of a key as
 * "no warning".
 */
export async function getSessionCertWarningsForWeek(
  weekStartDate: string,
  weekDays = 7,
): Promise<{
  data: Record<string, SessionCertWarning> | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const start = new Date(weekStartDate + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + (weekDays - 1));
    const weekEndDate = toLocalIso(end);

    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("id, date, coach_id, status")
      .gte("date", weekStartDate)
      .lte("date", weekEndDate)
      .not("coach_id", "is", null)
      .neq("status", "cancelled");

    if (sessErr) throw sessErr;

    const rows = (sessions ?? []) as Array<{
      id: string;
      date: string;
      coach_id: string;
      status: string;
    }>;
    if (rows.length === 0) return { data: {}, error: null };

    const coachIds = Array.from(new Set(rows.map((s) => s.coach_id)));

    const { data: certs, error: certErr } = await supabase
      .from("compliance_docs")
      .select("user_id, doc_type, expiry_date, status")
      .in("user_id", coachIds)
      .in("doc_type", [...BLOCKING_CERT_TYPES]);

    if (certErr) throw certErr;

    const certsByCoach = new Map<string, CertCheckInput[]>();
    for (const c of (certs ?? []) as Array<
      { user_id: string } & CertCheckInput
    >) {
      const list = certsByCoach.get(c.user_id) ?? [];
      list.push({
        doc_type: c.doc_type,
        expiry_date: c.expiry_date,
        status: c.status,
      });
      certsByCoach.set(c.user_id, list);
    }

    const result: Record<string, SessionCertWarning> = {};

    for (const sess of rows) {
      const coachCerts = certsByCoach.get(sess.coach_id) ?? [];

      const guard = assertCoachCertsValidForSession({
        certs: coachCerts,
        sessionDate: sess.date,
      });

      const blocked = guard.ok ? [] : guard.blockedBy;

      // Soft warning: any blocking-type cert that expires within 14 days
      // of the session date but isn't already blocked. Pick the latest
      // valid row per type so a renewal doesn't get masked by an old row.
      const expiring: ExpiringCert[] = [];
      for (const type of BLOCKING_CERT_TYPES) {
        const rowsOfType = coachCerts
          .filter((c) => c.doc_type === type && c.expiry_date)
          .filter((c) => c.status !== "expired" && c.status !== "rejected");

        if (rowsOfType.length === 0) continue;

        // Latest expiry first
        const latest = rowsOfType.reduce((acc, c) =>
          (c.expiry_date ?? "") > (acc.expiry_date ?? "") ? c : acc,
        );
        if (!latest.expiry_date) continue;

        const days = dateDeltaDays(latest.expiry_date, sess.date);
        if (days > 0 && days <= EXPIRING_WINDOW_DAYS) {
          expiring.push({
            doc_type: type,
            expiry_date: latest.expiry_date,
            daysUntilExpiry: days,
          });
        }
      }

      if (blocked.length > 0 || expiring.length > 0) {
        result[sess.id] = { blocked, expiring };
      }
    }

    return { data: result, error: null };
  } catch (err) {
    console.error("getSessionCertWarningsForWeek error:", err);
    return { data: null, error: "Failed to load cert warnings." };
  }
}
