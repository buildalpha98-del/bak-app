import type { BlockedCert } from "./cert-guard";

/**
 * Per-session cert state used by the weekly roster grid.
 *
 * `blocked` = the hard-guard verdict for that session's date — same
 * function the API uses to refuse assignment, so the badge and the
 * server are guaranteed to agree.
 *
 * `expiring` = a softer signal: cert is currently valid for this
 * session, but expires within 14 days OF THE SESSION DATE. Surfaced
 * in amber so coordinators have a heads-up to chase a renewal before
 * the next roster cycle.
 */
export interface ExpiringCert {
  doc_type: "wwcc" | "first_aid";
  expiry_date: string;
  daysUntilExpiry: number;
}

export interface SessionCertWarning {
  blocked: BlockedCert[];
  expiring: ExpiringCert[];
}

const LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
};

/** Plain-English description for tooltips and detail-sheet banners. */
export function describeSessionCertWarning(w: SessionCertWarning): string {
  if (w.blocked.length > 0) {
    const parts = w.blocked
      .map((b) => {
        const label = LABELS[b.doc_type] ?? b.doc_type;
        if (b.status === "rejected") return `${label} rejected`;
        if (b.expiry_date) return `${label} expired (${b.expiry_date})`;
        return `${label} expired`;
      })
      .join(", ");
    return `Coach blocked from this session: ${parts}.`;
  }
  if (w.expiring.length > 0) {
    const parts = w.expiring
      .map((e) => {
        const label = LABELS[e.doc_type] ?? e.doc_type;
        return `${label} expires in ${e.daysUntilExpiry} day${
          e.daysUntilExpiry === 1 ? "" : "s"
        }`;
      })
      .join(", ");
    return `${parts}.`;
  }
  return "";
}
