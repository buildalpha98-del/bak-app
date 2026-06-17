import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, financialAccessMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  financialAccessMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/auth/financial-access", () => ({
  getFinancialAccess: financialAccessMock,
}));

import {
  bulkUpdateCentreStatus,
  exportCentresCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Auth + Supabase helpers
// ============================================================
//
// Centres-table updates are dispatched per-id, so we need an
// `update` thenable that resolves once per call. Activity log inserts
// follow the same pattern. We track invocations on the per-call
// recorders so each test can assert how many real writes happened.

interface AuthOpts {
  /** Defaults to an admin user. */
  role?: "admin" | "ops" | "coach";
  /** Force a Centre.update error for a particular id. */
  failOnIds?: Set<string>;
}

function mockAuthAndUpdates(opts: AuthOpts = {}) {
  const role = opts.role ?? "admin";
  const failOnIds = opts.failOnIds ?? new Set<string>();
  const updates: string[] = [];
  const logs: string[] = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "viewer-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { role }, error: null }),
          }),
        }),
      };
    }
    if (table === "centres") {
      return {
        update: () => ({
          eq: (_col: string, id: string) => {
            updates.push(id);
            if (failOnIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced failure for ${id}` },
              });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { entity_id: string }) => {
          logs.push(row.entity_id);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { updates, logs };
}

describe("bulkUpdateCentreStatus", () => {
  it("rejects coaches with a 403-style error and writes nothing", async () => {
    mockAuthAndUpdates({ role: "coach" });
    const result = await bulkUpdateCentreStatus(["c1", "c2"], "active");
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("updates 3 centres and logs 3 activity rows on the happy path", async () => {
    const { updates, logs } = mockAuthAndUpdates({ role: "admin" });
    const result = await bulkUpdateCentreStatus(["c1", "c2", "c3"], "paused");
    expect(result).toEqual({ updated: 3, error: null });
    expect(updates).toEqual(["c1", "c2", "c3"]);
    expect(logs).toEqual(["c1", "c2", "c3"]);
  });

  it("surfaces partial failure when one row fails", async () => {
    const { updates, logs } = mockAuthAndUpdates({
      role: "ops",
      failOnIds: new Set(["c2"]),
    });
    const result = await bulkUpdateCentreStatus(
      ["c1", "c2", "c3"],
      "churned"
    );
    expect(result.updated).toBe(2);
    expect(result.error).toContain("Updated 2 of 3");
    expect(result.error).toContain("forced failure for c2");
    expect(updates).toEqual(["c1", "c2", "c3"]); // all attempted
    expect(logs).toEqual(["c1", "c3"]); // only successes logged
  });

  it("rejects an empty selection up front", async () => {
    const result = await bulkUpdateCentreStatus([], "active");
    expect(result).toEqual({ updated: 0, error: "No centres selected." });
    // No auth/db side effects should have fired.
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });
});

// ============================================================
// exportCentresCsv
// ============================================================
//
// We assert the CSV header line directly rather than parsing rows so a
// stray column rename in the production code reads as a deliberate
// breaking change.

function mockCsvRows(rows: Array<Record<string, unknown>>) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "centres") {
      return {
        select: () => ({
          in: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("exportCentresCsv", () => {
  it("omits agreed_rate entirely when the viewer lacks financial access", async () => {
    financialAccessMock.mockResolvedValue(false);
    mockCsvRows([
      {
        id: "c1",
        name: "Sunny Daycare",
        type: "childcare_centre",
        address: "1 Sun St",
        primary_contact_name: "Ana",
        primary_contact_email: "ana@example.com",
        contract_status: "active",
        pricing_model: "centre_funded",
        health_score: 82,
        health_status: "thriving",
        churn_risk: false,
      },
    ]);

    const { csv, error } = await exportCentresCsv(["c1"]);
    expect(error).toBeNull();
    expect(csv).not.toBeNull();
    const lines = csv!.split("\n");
    expect(lines[0]).not.toContain("agreed_rate");
    // Spot-check that the data row mirrors the header ordering and
    // doesn't smuggle the rate column through.
    expect(lines[0].split(",")).toHaveLength(11);
    expect(lines[1].split(",")).toHaveLength(11);
  });

  it("includes agreed_rate when the viewer has financial access", async () => {
    financialAccessMock.mockResolvedValue(true);
    mockCsvRows([
      {
        id: "c1",
        name: "Sunny Daycare",
        type: "childcare_centre",
        address: "1 Sun St",
        primary_contact_name: "Ana",
        primary_contact_email: "ana@example.com",
        contract_status: "active",
        pricing_model: "centre_funded",
        health_score: 82,
        health_status: "thriving",
        churn_risk: false,
        agreed_rate: 165,
      },
    ]);

    const { csv, error } = await exportCentresCsv(["c1"]);
    expect(error).toBeNull();
    expect(csv).not.toBeNull();
    const lines = csv!.split("\n");
    expect(lines[0]).toContain("agreed_rate");
    expect(lines[0]).toBe(
      "id,name,type,address,primary_contact_name,primary_contact_email,contract_status,pricing_model,health_score,health_status,churn_risk,agreed_rate"
    );
    expect(lines[1]).toContain(",165");
  });

  it("quotes cells containing commas per RFC 4180", async () => {
    financialAccessMock.mockResolvedValue(false);
    mockCsvRows([
      {
        id: "c1",
        name: "ABC, Inc.",
        type: "childcare_centre",
        address: "1 Sun St",
        primary_contact_name: null,
        primary_contact_email: null,
        contract_status: "active",
        pricing_model: "centre_funded",
        health_score: null,
        health_status: null,
        churn_risk: false,
      },
    ]);

    const { csv } = await exportCentresCsv(["c1"]);
    expect(csv).toContain('"ABC, Inc."');
  });

  it("rejects empty selection", async () => {
    const result = await exportCentresCsv([]);
    expect(result).toEqual({ csv: null, error: "No centres selected." });
  });
});
