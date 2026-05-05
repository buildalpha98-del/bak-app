import type { ComplianceDocType, ComplianceStatus } from "@/lib/types/enums";

/**
 * Compliance docs whose expiry/rejection blocks a coach from being
 * assigned to a session. Soft-checked in the AI scheduling solver
 * (-3 score penalty); HARD-checked here at the API boundary.
 *
 * Adapted from amana-eos-dashboard's `assertStaffCertsValidForShift`
 * (PR #52). amana also gates on `food_safety` for kitchen leads — Build
 * Alpha Kids doesn't run kitchens, so just WWCC + First Aid here.
 */
export const BLOCKING_CERT_TYPES = ["wwcc", "first_aid"] as const;
export type BlockingCertType = (typeof BLOCKING_CERT_TYPES)[number];

const CERT_TYPE_LABELS: Record<BlockingCertType, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
};

const BLOCKED_STATUSES: ComplianceStatus[] = ["expired", "rejected"];

export interface CertCheckInput {
  doc_type: ComplianceDocType;
  expiry_date: string | null;
  status: ComplianceStatus;
}

export interface BlockedCert {
  doc_type: BlockingCertType;
  expiry_date: string | null;
  status: ComplianceStatus;
}

export type CertCheckResult =
  | { ok: true }
  | { ok: false; message: string; blockedBy: BlockedCert[] };

function isCertValid(c: CertCheckInput, sessionDate: string): boolean {
  if (BLOCKED_STATUSES.includes(c.status)) return false;
  if (c.expiry_date && c.expiry_date <= sessionDate) return false;
  return true;
}

function fmtAuDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function describeBlocked(b: BlockedCert): string {
  const label = CERT_TYPE_LABELS[b.doc_type];
  if (b.status === "rejected") return `${label} (rejected)`;
  if (b.expiry_date) return `${label} (expired ${fmtAuDate(b.expiry_date)})`;
  return `${label} (expired)`;
}

/**
 * Returns `{ ok: true }` if the coach is cleared to work on `sessionDate`,
 * otherwise `{ ok: false }` with a human-readable message and the list
 * of blocking certs.
 *
 * Rules:
 * - Only `wwcc` and `first_aid` are blocking; everything else is ignored.
 * - For each blocking type, if the coach has AT LEAST ONE row that is
 *   valid (status not expired/rejected, and expiry_date is null or
 *   strictly after sessionDate), they pass for that type. This handles
 *   renewal: an old expired wwcc next to a new verified one is fine.
 * - Missing rows are NOT blocked (mirrors amana). Surface those via the
 *   compliance dashboard, not the assignment guard.
 * - `pending` status is NOT blocking — coaches with a freshly uploaded
 *   doc shouldn't be locked out while ops verifies it.
 *
 * Pure: no DB calls. Caller fetches the rows and passes them in.
 */
export function assertCoachCertsValidForSession({
  certs,
  sessionDate,
}: {
  certs: CertCheckInput[];
  sessionDate: string;
}): CertCheckResult {
  const blockedBy: BlockedCert[] = [];

  for (const type of BLOCKING_CERT_TYPES) {
    const rowsOfType = certs.filter((c) => c.doc_type === type);
    if (rowsOfType.length === 0) continue;
    if (rowsOfType.some((c) => isCertValid(c, sessionDate))) continue;

    // Pick the worst-blocking row for the message: prefer the one with
    // the latest expiry_date (so renewal-pending rows surface over
    // long-expired ones), falling back to the first.
    const worst =
      [...rowsOfType].sort((a, b) => {
        const ax = a.expiry_date ?? "";
        const bx = b.expiry_date ?? "";
        return ax < bx ? 1 : ax > bx ? -1 : 0;
      })[0] ?? rowsOfType[0];

    blockedBy.push({
      doc_type: type,
      expiry_date: worst.expiry_date,
      status: worst.status,
    });
  }

  if (blockedBy.length === 0) return { ok: true };

  const summary = blockedBy.map(describeBlocked).join(", ");
  return {
    ok: false,
    blockedBy,
    message: `Cannot assign — coach has invalid compliance documents: ${summary}. Renew or update before assigning.`,
  };
}
