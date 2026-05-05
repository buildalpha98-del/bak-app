import type { ComplianceDocType, ComplianceStatus } from "@/lib/types/enums";

/**
 * Compliance doc types that have meaningful expiry windows. Used by the
 * per-coach / per-centre cert-expiry health card.
 *
 * Excluded: `code_of_conduct`, `policy_ack`, `other` — those are
 * one-off acknowledgements without renewal cadence, so they don't show
 * up in the time-bound expiry roll-up.
 *
 * Adapted from amana-eos-dashboard's `cert-expiry.ts` admin digest.
 */
export const TRACKED_EXPIRY_TYPES = [
  "wwcc",
  "first_aid",
  "police_check",
  "insurance",
  "coaching_cert",
] as const;

export type TrackedExpiryType = (typeof TRACKED_EXPIRY_TYPES)[number];

const DAY_MS = 86_400_000;
const SEVEN_DAYS = 7 * DAY_MS;
const FOURTEEN_DAYS = 14 * DAY_MS;
const THIRTY_DAYS = 30 * DAY_MS;

const INVALID_STATUSES: ComplianceStatus[] = ["expired", "rejected"];

export interface CertSummaryRow {
  id: string;
  user_id: string;
  user_name: string | null;
  doc_type: ComplianceDocType;
  expiry_date: string | null;
  status: ComplianceStatus;
}

export interface CertBucketResult {
  /** Sum of every bucket — only counts rows actually being time-tracked. */
  total: number;
  expired: number;
  critical: number;
  warning: number;
  upcoming: number;
  expiredItems: CertSummaryRow[];
  criticalItems: CertSummaryRow[];
  warningItems: CertSummaryRow[];
  upcomingItems: CertSummaryRow[];
}

function isTrackedType(t: ComplianceDocType): t is TrackedExpiryType {
  return (TRACKED_EXPIRY_TYPES as readonly string[]).includes(t);
}

function parseDateUtc(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d);
}

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Bucket compliance docs by how soon they expire relative to `now`.
 *
 * Bucket boundaries (non-overlapping, each row falls into exactly one):
 * - **expired**:   status is expired/rejected, OR expiry_date is on or before today
 *                  (matches the cert-guard `<= sessionDate` rule — a cert that
 *                  expires today is invalid for today's sessions)
 * - **critical**:  expiry_date in (today, today + 7 days]
 * - **warning**:   expiry_date in (today + 7 days, today + 14 days]
 * - **upcoming**:  expiry_date in (today + 14 days, today + 30 days]
 * - Anything beyond 30 days is dropped (not surfaced).
 *
 * Rows without an `expiry_date` are dropped — we can't time-track them.
 * Rows with an untracked `doc_type` (e.g. `policy_ack`) are dropped.
 *
 * Pure: no DB calls. Caller fetches and passes in.
 */
export function bucketCertExpiry(
  certs: CertSummaryRow[],
  now: Date,
): CertBucketResult {
  const todayMs = startOfDayUtc(now);

  const expiredItems: CertSummaryRow[] = [];
  const criticalItems: CertSummaryRow[] = [];
  const warningItems: CertSummaryRow[] = [];
  const upcomingItems: CertSummaryRow[] = [];

  for (const c of certs) {
    if (!isTrackedType(c.doc_type)) continue;
    if (!c.expiry_date) continue;

    const expiryMs = parseDateUtc(c.expiry_date);
    if (Number.isNaN(expiryMs)) continue;

    const isInvalidStatus = INVALID_STATUSES.includes(c.status);

    if (isInvalidStatus || expiryMs <= todayMs) {
      expiredItems.push(c);
      continue;
    }

    const delta = expiryMs - todayMs;
    if (delta <= SEVEN_DAYS) {
      criticalItems.push(c);
    } else if (delta <= FOURTEEN_DAYS) {
      warningItems.push(c);
    } else if (delta <= THIRTY_DAYS) {
      upcomingItems.push(c);
    }
  }

  // Most urgent first within each bucket.
  const byExpiryAsc = (a: CertSummaryRow, b: CertSummaryRow) => {
    const ax = a.expiry_date ?? "";
    const bx = b.expiry_date ?? "";
    return ax < bx ? -1 : ax > bx ? 1 : 0;
  };
  expiredItems.sort(byExpiryAsc);
  criticalItems.sort(byExpiryAsc);
  warningItems.sort(byExpiryAsc);
  upcomingItems.sort(byExpiryAsc);

  return {
    total:
      expiredItems.length +
      criticalItems.length +
      warningItems.length +
      upcomingItems.length,
    expired: expiredItems.length,
    critical: criticalItems.length,
    warning: warningItems.length,
    upcoming: upcomingItems.length,
    expiredItems,
    criticalItems,
    warningItems,
    upcomingItems,
  };
}
