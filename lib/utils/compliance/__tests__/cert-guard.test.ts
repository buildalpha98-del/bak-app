import { describe, it, expect } from "vitest";
import {
  assertCoachCertsValidForSession,
  BLOCKING_CERT_TYPES,
  type CertCheckInput,
} from "../cert-guard";

function cert(overrides: Partial<CertCheckInput> = {}): CertCheckInput {
  return {
    doc_type: "wwcc",
    expiry_date: "2030-01-01",
    status: "verified",
    ...overrides,
  };
}

describe("BLOCKING_CERT_TYPES", () => {
  it("only blocks on wwcc and first_aid", () => {
    expect(BLOCKING_CERT_TYPES).toEqual(["wwcc", "first_aid"]);
  });
});

describe("assertCoachCertsValidForSession", () => {
  const SESSION_DATE = "2026-05-04";

  it("passes when the coach has no certs at all (missing != blocked)", () => {
    const result = assertCoachCertsValidForSession({
      certs: [],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(true);
  });

  it("passes when all blocking certs are verified and far in the future", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "wwcc", expiry_date: "2030-01-01", status: "verified" }),
        cert({ doc_type: "first_aid", expiry_date: "2030-01-01", status: "verified" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks when wwcc has status 'expired' regardless of date", () => {
    const result = assertCoachCertsValidForSession({
      certs: [cert({ doc_type: "wwcc", expiry_date: "2030-01-01", status: "expired" })],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockedBy).toHaveLength(1);
      expect(result.blockedBy[0].doc_type).toBe("wwcc");
      expect(result.message).toContain("WWCC");
    }
  });

  it("blocks when wwcc has status 'rejected'", () => {
    const result = assertCoachCertsValidForSession({
      certs: [cert({ doc_type: "wwcc", status: "rejected" })],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(false);
  });

  it("blocks when expiry_date is strictly before the session date", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "first_aid", expiry_date: "2026-05-03", status: "verified" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockedBy[0].doc_type).toBe("first_aid");
      expect(result.message).toContain("First Aid");
    }
  });

  it("blocks when expiry_date equals the session date (day-of expiry counts as expired)", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "wwcc", expiry_date: SESSION_DATE, status: "verified" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(false);
  });

  it("passes when expiry_date is the day after the session date", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "wwcc", expiry_date: "2026-05-05", status: "verified" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(true);
  });

  it("lists every blocked type when both wwcc and first_aid are bad", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "wwcc", expiry_date: "2026-04-01", status: "verified" }),
        cert({ doc_type: "first_aid", status: "rejected", expiry_date: "2030-01-01" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockedBy.map((b) => b.doc_type).sort()).toEqual([
        "first_aid",
        "wwcc",
      ]);
      expect(result.message).toContain("WWCC");
      expect(result.message).toContain("First Aid");
    }
  });

  it("ignores non-blocking cert types (police_check, insurance, etc.)", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "police_check", status: "expired", expiry_date: "2025-01-01" }),
        cert({ doc_type: "insurance", status: "rejected" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(true);
  });

  it("does not block on 'pending' (uploaded but not yet verified)", () => {
    const result = assertCoachCertsValidForSession({
      certs: [cert({ doc_type: "wwcc", status: "pending", expiry_date: "2030-01-01" })],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(true);
  });

  it("passes when an old expired wwcc is superseded by a current verified one (any valid row wins)", () => {
    const result = assertCoachCertsValidForSession({
      certs: [
        cert({ doc_type: "wwcc", expiry_date: "2024-01-01", status: "expired" }),
        cert({ doc_type: "wwcc", expiry_date: "2030-01-01", status: "verified" }),
      ],
      sessionDate: SESSION_DATE,
    });
    expect(result.ok).toBe(true);
  });

  it("treats a cert with null expiry_date as not date-expired (status still applies)", () => {
    // Verified cert, no expiry on file → pass
    const okResult = assertCoachCertsValidForSession({
      certs: [cert({ doc_type: "wwcc", expiry_date: null, status: "verified" })],
      sessionDate: SESSION_DATE,
    });
    expect(okResult.ok).toBe(true);

    // Rejected cert, no expiry → still blocked
    const blockedResult = assertCoachCertsValidForSession({
      certs: [cert({ doc_type: "wwcc", expiry_date: null, status: "rejected" })],
      sessionDate: SESSION_DATE,
    });
    expect(blockedResult.ok).toBe(false);
  });
});
