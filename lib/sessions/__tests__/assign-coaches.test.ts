import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted ensures these are initialized before vi.mock factories run
// (vi.mock is hoisted to the top of the file by Vitest).
const {
  supabaseMock,
  setSessionCoachesMock,
  bulkCheckMock,
  activityLogInsertMock,
} = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
  setSessionCoachesMock: vi.fn(),
  bulkCheckMock: vi.fn(),
  activityLogInsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/sessions/session-coaches", () => ({
  setSessionCoaches: setSessionCoachesMock,
}));
vi.mock("@/lib/utils/compliance/check-coach-certs", () => ({
  bulkCheckCoachCertsForSessions: bulkCheckMock,
}));

import { assignCoaches } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface MockAuthOptions {
  /** Existing session_coaches rows (defaults to one primary "u1"). */
  existingCoaches?: Array<{ user_id: string; is_primary: boolean }>;
  /** Resolved names for the in()-lookup used in the cert-blocked path. */
  profileNames?: Array<{ id: string; name: string | null }>;
}

function mockAuth(role: "admin" | "ops" | "coach", opts: MockAuthOptions = {}) {
  const existingCoaches = opts.existingCoaches ?? [
    { user_id: "u1", is_primary: true },
  ];
  const profileNames = opts.profileNames ?? [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "ops1" } },
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      // Two access paths: `.select().eq().single()` for the role
      // check, and `.select().in()` for the cert-blocked name lookup.
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { role }, error: null }),
          }),
          in: () => Promise.resolve({ data: profileNames, error: null }),
        }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { date: "2026-06-01" },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "session_coaches") {
      // current rows for diff
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: existingCoaches,
              error: null,
            }),
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (rows: unknown) => {
          activityLogInsertMock(rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "notifications") {
      return { insert: () => Promise.resolve({ error: null }) };
    }
    throw new Error(`unmocked table ${table}`);
  });
}

describe("assignCoaches", () => {
  it("rejects unauthenticated callers", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("rejects coach-role callers", async () => {
    mockAuth("coach");
    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);
    expect(result.error).toMatch(/admin or ops/i);
  });

  it("runs cert guard against every assigned coach", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({
      valid: [
        { coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" },
        { coachId: "u2", sessionId: "s1", sessionDate: "2026-06-01" },
      ],
      blocked: [],
    });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
      { userId: "u2", isPrimary: false },
    ]);

    expect(bulkCheckMock).toHaveBeenCalledWith([
      { coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" },
      { coachId: "u2", sessionId: "s1", sessionDate: "2026-06-01" },
    ]);
    expect(result.error).toBeNull();
  });

  it("refuses the whole assignment if any coach fails cert guard, and surfaces resolved names", async () => {
    mockAuth("ops", {
      profileNames: [{ id: "u2", name: "Bob" }],
    });
    bulkCheckMock.mockResolvedValue({
      valid: [{ coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" }],
      blocked: [
        {
          coachId: "u2",
          sessionId: "s1",
          sessionDate: "2026-06-01",
          result: { ok: false, message: "WWCC expired 2026-04-01" },
        },
      ],
    });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
      { userId: "u2", isPrimary: false },
    ]);

    expect(setSessionCoachesMock).not.toHaveBeenCalled();
    expect(result.error).toMatch(/WWCC expired/);
    expect(result.error).toMatch(/Bob:/); // resolved name appears
    expect(result.error).not.toMatch(/u2:/); // UUID does not
  });

  it("falls back to UUID when a blocked coach has no profile name", async () => {
    mockAuth("ops", { profileNames: [] }); // empty lookup result
    bulkCheckMock.mockResolvedValue({
      valid: [],
      blocked: [
        {
          coachId: "u-ghost",
          sessionId: "s1",
          sessionDate: "2026-06-01",
          result: { ok: false, message: "WWCC missing" },
        },
      ],
    });

    const result = await assignCoaches("s1", [
      { userId: "u-ghost", isPrimary: true },
    ]);
    expect(result.error).toMatch(/u-ghost: WWCC missing/);
  });

  it("emits no activity_log rows when the new set equals the existing set", async () => {
    // Existing = [{u1, primary}]; new = [{u1, primary}] — idempotent.
    mockAuth("ops", {
      existingCoaches: [{ user_id: "u1", is_primary: true }],
    });
    bulkCheckMock.mockResolvedValue({
      valid: [{ coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" }],
      blocked: [],
    });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);

    expect(result.error).toBeNull();
    expect(activityLogInsertMock).not.toHaveBeenCalled();
  });

  it("propagates setSessionCoaches errors", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({
      valid: [{ coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" }],
      blocked: [],
    });
    setSessionCoachesMock.mockResolvedValue({
      error: "permission denied",
    });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);
    expect(result.error).toBe("permission denied");
  });

  it("allows empty array (clears shift; trigger handles status)", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await assignCoaches("s1", []);
    expect(result.error).toBeNull();
    expect(bulkCheckMock).toHaveBeenCalledWith([]);
    expect(setSessionCoachesMock).toHaveBeenCalledWith({
      sessionId: "s1",
      coaches: [],
      assignedBy: "ops1",
    });
  });
});
