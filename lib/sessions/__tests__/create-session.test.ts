import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, setSessionCoachesMock, certCheckMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  setSessionCoachesMock: vi.fn(),
  certCheckMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/sessions/session-coaches", () => ({
  setSessionCoaches: setSessionCoachesMock,
}));
vi.mock("@/lib/utils/compliance/check-coach-certs", () => ({
  checkCoachCertsForSession: certCheckMock,
  checkCoachCertsForSessionDates: vi.fn(),
  bulkCheckCoachCertsForSessions: vi.fn(),
}));

import { createSession } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "ops1" } },
  });
});

describe("createSession rollback", () => {
  it("deletes the just-inserted session when setSessionCoaches fails", async () => {
    certCheckMock.mockResolvedValue({ ok: true });

    const deleteCalls: string[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== "sessions") throw new Error(`unexpected table ${table}`);
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "new-session-1" },
                error: null,
              }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deleteCalls.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    });

    setSessionCoachesMock.mockResolvedValue({ error: "boom" });

    const result = await createSession({
      term_id: "t1",
      date: "2026-06-01",
      time: "09:00",
      duration_minutes: 60,
      centre_id: "c1",
      sport: "Soccer",
      coach_id: "u1",
    });

    expect(result.error).toBe("boom");
    expect(result.data).toBeNull();
    expect(deleteCalls).toEqual(["new-session-1"]);
  });
});
