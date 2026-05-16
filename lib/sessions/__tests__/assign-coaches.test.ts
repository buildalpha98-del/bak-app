import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted ensures these are initialized before vi.mock factories run
// (vi.mock is hoisted to the top of the file by Vitest).
const { supabaseMock, setSessionCoachesMock, bulkCheckMock } = vi.hoisted(
  () => ({
    supabaseMock: {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
      rpc: vi.fn(),
    },
    setSessionCoachesMock: vi.fn(),
    bulkCheckMock: vi.fn(),
  })
);

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

function mockAuth(role: "admin" | "ops" | "coach") {
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "ops1" } },
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { role }, error: null }),
          }),
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
              data: [{ user_id: "u1", is_primary: true }],
              error: null,
            }),
        }),
      };
    }
    if (table === "activity_log") {
      return { insert: () => Promise.resolve({ error: null }) };
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

  it("refuses the whole assignment if any coach fails cert guard", async () => {
    mockAuth("ops");
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
