import { describe, it, expect } from "vitest";
import {
  bucketCertExpiry,
  TRACKED_EXPIRY_TYPES,
  type CertSummaryRow,
} from "../cert-expiry-summary";

const NOW = new Date("2026-05-04T00:00:00Z");

function row(overrides: Partial<CertSummaryRow> = {}): CertSummaryRow {
  return {
    id: "doc-1",
    user_id: "coach-1",
    user_name: "Test Coach",
    doc_type: "wwcc",
    expiry_date: "2030-01-01",
    status: "verified",
    ...overrides,
  };
}

describe("TRACKED_EXPIRY_TYPES", () => {
  it("covers wwcc, first_aid, police_check, insurance, coaching_cert", () => {
    expect(TRACKED_EXPIRY_TYPES).toEqual([
      "wwcc",
      "first_aid",
      "police_check",
      "insurance",
      "coaching_cert",
    ]);
  });
});

describe("bucketCertExpiry", () => {
  it("returns all-zero buckets for an empty list", () => {
    const result = bucketCertExpiry([], NOW);
    expect(result).toEqual({
      total: 0,
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
      expiredItems: [],
      criticalItems: [],
      warningItems: [],
      upcomingItems: [],
    });
  });

  it("ignores rows with no expiry_date (we can't time-track them)", () => {
    const result = bucketCertExpiry(
      [row({ expiry_date: null, doc_type: "code_of_conduct" })],
      NOW,
    );
    expect(result.total).toBe(0);
  });

  it("ignores doc_types not in TRACKED_EXPIRY_TYPES", () => {
    const result = bucketCertExpiry(
      [row({ doc_type: "policy_ack", expiry_date: "2026-05-10" })],
      NOW,
    );
    expect(result.total).toBe(0);
  });

  it("counts a cert with expiry strictly before today as expired", () => {
    const result = bucketCertExpiry(
      [row({ expiry_date: "2026-05-03" })],
      NOW,
    );
    expect(result.expired).toBe(1);
    expect(result.total).toBe(1);
    expect(result.expiredItems).toHaveLength(1);
  });

  it("counts a cert with status='expired' as expired even if date is future", () => {
    const result = bucketCertExpiry(
      [row({ expiry_date: "2030-01-01", status: "expired" })],
      NOW,
    );
    expect(result.expired).toBe(1);
  });

  it("counts a cert with status='rejected' as expired (invalid)", () => {
    const result = bucketCertExpiry(
      [row({ expiry_date: "2030-01-01", status: "rejected" })],
      NOW,
    );
    expect(result.expired).toBe(1);
  });

  it("counts a cert expiring today as critical (≤ 7d)", () => {
    const result = bucketCertExpiry(
      [row({ expiry_date: "2026-05-04" })],
      NOW,
    );
    expect(result.critical).toBe(1);
    expect(result.expired).toBe(0);
  });

  it("counts a cert expiring in 7 days as critical, day 8 as warning", () => {
    const day7 = bucketCertExpiry([row({ expiry_date: "2026-05-11" })], NOW);
    expect(day7.critical).toBe(1);

    const day8 = bucketCertExpiry([row({ expiry_date: "2026-05-12" })], NOW);
    expect(day8.warning).toBe(1);
    expect(day8.critical).toBe(0);
  });

  it("counts a cert expiring in 14 days as warning, day 15 as upcoming", () => {
    const day14 = bucketCertExpiry([row({ expiry_date: "2026-05-18" })], NOW);
    expect(day14.warning).toBe(1);

    const day15 = bucketCertExpiry([row({ expiry_date: "2026-05-19" })], NOW);
    expect(day15.upcoming).toBe(1);
    expect(day15.warning).toBe(0);
  });

  it("counts a cert expiring in 30 days as upcoming, day 31 as nothing", () => {
    const day30 = bucketCertExpiry([row({ expiry_date: "2026-06-03" })], NOW);
    expect(day30.upcoming).toBe(1);

    const day31 = bucketCertExpiry([row({ expiry_date: "2026-06-04" })], NOW);
    expect(day31.upcoming).toBe(0);
    expect(day31.total).toBe(0);
  });

  it("places each cert in exactly one bucket, never double-counts", () => {
    const result = bucketCertExpiry(
      [
        row({ id: "1", expiry_date: "2026-05-01" }), // expired
        row({ id: "2", expiry_date: "2026-05-04" }), // critical (today)
        row({ id: "3", expiry_date: "2026-05-12" }), // warning (8d)
        row({ id: "4", expiry_date: "2026-06-03" }), // upcoming (30d)
      ],
      NOW,
    );
    expect(result.expired).toBe(1);
    expect(result.critical).toBe(1);
    expect(result.warning).toBe(1);
    expect(result.upcoming).toBe(1);
    expect(result.total).toBe(4);
    expect(
      result.expired + result.critical + result.warning + result.upcoming,
    ).toBe(result.total);
  });

  it("sorts items by expiry_date ascending (most urgent first)", () => {
    const result = bucketCertExpiry(
      [
        row({ id: "later", expiry_date: "2026-04-30" }),
        row({ id: "earliest", expiry_date: "2026-04-15" }),
        row({ id: "middle", expiry_date: "2026-04-20" }),
      ],
      NOW,
    );
    expect(result.expiredItems.map((i) => i.id)).toEqual([
      "earliest",
      "middle",
      "later",
    ]);
  });

  it("handles all blocking and non-blocking tracked types together", () => {
    // NOW = 2026-05-04: May 01 -3d (expired), May 10 +6d (critical),
    // May 17 +13d (warning), May 30 +26d (upcoming), 2030 (out of window)
    const result = bucketCertExpiry(
      [
        row({ id: "1", doc_type: "wwcc", expiry_date: "2026-05-01" }),
        row({ id: "2", doc_type: "first_aid", expiry_date: "2026-05-10" }),
        row({ id: "3", doc_type: "police_check", expiry_date: "2026-05-17" }),
        row({ id: "4", doc_type: "insurance", expiry_date: "2026-05-30" }),
        row({ id: "5", doc_type: "coaching_cert", expiry_date: "2030-01-01" }),
      ],
      NOW,
    );
    expect(result.expired).toBe(1);
    expect(result.critical).toBe(1);
    expect(result.warning).toBe(1);
    expect(result.upcoming).toBe(1);
    expect(result.total).toBe(4); // coaching_cert in 2030 is outside the 30d window
  });
});
