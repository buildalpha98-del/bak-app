import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted ensures mocks are initialized before vi.mock factories
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

import { dragMoveSession } from "../dnd-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test harness — builds the Supabase mock for one scenario.
// Each builder returns a complete chain that terminates in a
// Promise so no test can hang on an unawaited fluent call.
// ============================================================

interface MockOptions {
  role?: "admin" | "ops" | "coach";
  /** Current sessions row returned by the snapshot fetch. */
  session?: {
    id: string;
    date: string;
    time: string;
    updated_at: string;
    duration_minutes: number;
  } | null;
  /** session_coaches rows for the candidate session (for cert fan-out). */
  sessionCoaches?: Array<{ user_id: string }>;
  /** session_coaches rows returned for the conflict probe. */
  conflictRows?: Array<{
    user_id: string;
    sessions: {
      id: string;
      date: string;
      time: string;
      duration_minutes: number;
      status: string;
    } | null;
  }>;
  /** Profile name lookup for the cert-blocked path. */
  profileNames?: Array<{ id: string; name: string | null }>;
  /** Row update result. */
  updateError?: { message: string } | null;
}

function mockSupabase(opts: MockOptions = {}) {
  const role = opts.role ?? "ops";
  const session = opts.session ?? {
    id: "s1",
    date: "2026-06-01",
    time: "09:00",
    updated_at: "2026-05-30T10:00:00.000Z",
    duration_minutes: 60,
  };
  const sessionCoaches = opts.sessionCoaches ?? [{ user_id: "u1" }];
  const conflictRows = opts.conflictRows ?? [];
  const profileNames = opts.profileNames ?? [];
  const updateError = opts.updateError ?? null;

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
              Promise.resolve(
                session
                  ? { data: session, error: null }
                  : { data: null, error: { message: "not found" } },
              ),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: updateError }),
        }),
      };
    }
    if (table === "session_coaches") {
      // Two access shapes: `.select("user_id").eq()` for the cert
      // fan-out, and `.select("user_id, sessions:...").in()` for the
      // conflict probe.
      return {
        select: (cols?: string) => {
          if (cols && cols.includes("sessions:")) {
            return {
              in: () => Promise.resolve({ data: conflictRows, error: null }),
            };
          }
          return {
            eq: () =>
              Promise.resolve({ data: sessionCoaches, error: null }),
          };
        },
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
    throw new Error(`unmocked table ${table}`);
  });
}

// ============================================================
// Tests — 10 cases per spec
// ============================================================

describe("dragMoveSession", () => {
  it("rejects coach-role callers (auth gate)", async () => {
    mockSupabase({ role: "coach" });
    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-02",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/admin or ops/i);
  });

  it("returns refresh message when expectedUpdatedAt mismatches current", async () => {
    mockSupabase({
      role: "ops",
      session: {
        id: "s1",
        date: "2026-06-01",
        time: "09:00",
        updated_at: "2026-05-30T11:00:00.000Z", // newer than expected
        duration_minutes: 60,
      },
    });
    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-02",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/refresh/i);
  });

  it("routes coach reassignment through setSessionCoaches (no direct coach_id write)", async () => {
    mockSupabase({ role: "ops" });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await dragMoveSession({
      sessionId: "s1",
      newCoachId: "u2",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(setSessionCoachesMock).toHaveBeenCalledWith({
      sessionId: "s1",
      coaches: [{ userId: "u2", isPrimary: true }],
      assignedBy: "ops1",
    });
  });

  it("cert guard blocks the move when WWCC expires before the new date", async () => {
    mockSupabase({
      role: "ops",
      sessionCoaches: [{ user_id: "u1" }],
      profileNames: [{ id: "u1", name: "Alice" }],
    });
    bulkCheckMock.mockResolvedValue({
      valid: [],
      blocked: [
        {
          coachId: "u1",
          sessionId: "s1",
          sessionDate: "2026-06-15",
          result: { ok: false, message: "WWCC expired 2026-06-10" },
        },
      ],
    });

    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-15",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Alice:/);
    expect(result.error).toMatch(/WWCC expired/);
    expect(setSessionCoachesMock).not.toHaveBeenCalled();
  });

  it("cert guard reads ALL assigned coaches from session_coaches (multi-coach)", async () => {
    mockSupabase({
      role: "ops",
      // Two coaches on the shift — both must be checked when the
      // date changes. P5 multi-coach fan-out per spec §6 P4.
      sessionCoaches: [{ user_id: "u1" }, { user_id: "u2" }],
    });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });

    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-02",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(bulkCheckMock).toHaveBeenCalledTimes(1);
    const pairs = bulkCheckMock.mock.calls[0][0] as Array<{
      coachId: string;
      sessionId: string;
      sessionDate: string;
    }>;
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.coachId).sort()).toEqual(["u1", "u2"]);
    expect(pairs.every((p) => p.sessionDate === "2026-06-02")).toBe(true);
  });

  it("flags conflict=true when the landed (date, time, coach) overlaps another shift", async () => {
    mockSupabase({
      role: "ops",
      sessionCoaches: [{ user_id: "u1" }],
      // Conflict probe: same coach has another non-cancelled shift
      // overlapping the candidate's [09:00, 10:00) window.
      conflictRows: [
        {
          user_id: "u1",
          sessions: {
            id: "s-other",
            date: "2026-06-02",
            time: "09:30",
            duration_minutes: 60,
            status: "published",
          },
        },
      ],
    });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });

    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-02",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.conflict).toBe(true);
  });

  it("does NOT flag conflict when no overlap exists", async () => {
    mockSupabase({
      role: "ops",
      sessionCoaches: [{ user_id: "u1" }],
      conflictRows: [
        {
          user_id: "u1",
          sessions: {
            id: "s-other",
            date: "2026-06-02",
            time: "14:00", // far away from 09:00
            duration_minutes: 60,
            status: "published",
          },
        },
      ],
    });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });

    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-02",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(result.conflict).toBeUndefined();
  });

  it("writes an activity_log entry tagged 'session_dnd_moved' on success", async () => {
    mockSupabase({ role: "ops" });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });

    await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-02",
      newTime: "10:00",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(activityLogInsertMock).toHaveBeenCalledTimes(1);
    const row = activityLogInsertMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(row.action).toBe("session_dnd_moved");
    expect(row.entity_type).toBe("session");
    expect(row.entity_id).toBe("s1");
    expect(
      (row.metadata as Record<string, unknown>).new_date,
    ).toBe("2026-06-02");
    expect(
      (row.metadata as Record<string, unknown>).new_time,
    ).toBe("10:00");
  });

  it("supports a date-only patch (no coach change)", async () => {
    mockSupabase({ role: "ops" });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });

    const result = await dragMoveSession({
      sessionId: "s1",
      newDate: "2026-06-03",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    expect(setSessionCoachesMock).not.toHaveBeenCalled();
    // Cert guard fan-out still ran because the date changed.
    expect(bulkCheckMock).toHaveBeenCalledTimes(1);
  });

  it("supports a coach-only patch (no date change)", async () => {
    mockSupabase({ role: "ops" });
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await dragMoveSession({
      sessionId: "s1",
      newCoachId: "u9",
      expectedUpdatedAt: "2026-05-30T10:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    // No date in patch, but the new coach still gets cert-checked
    // against the existing date.
    expect(bulkCheckMock).toHaveBeenCalledTimes(1);
    const pairs = bulkCheckMock.mock.calls[0][0] as Array<{
      coachId: string;
      sessionDate: string;
    }>;
    expect(pairs[0].coachId).toBe("u9");
    expect(pairs[0].sessionDate).toBe("2026-06-01"); // unchanged date
    expect(setSessionCoachesMock).toHaveBeenCalledWith({
      sessionId: "s1",
      coaches: [{ userId: "u9", isPrimary: true }],
      assignedBy: "ops1",
    });
  });
});
