import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ============================================================
// Hoisted mocks — initialised before vi.mock factories run.
// ============================================================
const {
  supabaseMock,
  adminMock,
  smsMock,
  insertedBroadcasts,
  insertedNotifications,
  insertedActivityLog,
} = vi.hoisted(() => {
  const insertedBroadcasts: Array<Record<string, unknown>> = [];
  const insertedNotifications: Array<Array<Record<string, unknown>>> = [];
  const insertedActivityLog: Array<Record<string, unknown>> = [];
  const supabaseMock = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  };
  const adminMock = {
    from: vi.fn(),
  };
  const smsMock = vi.fn();
  return {
    supabaseMock,
    adminMock,
    smsMock,
    insertedBroadcasts,
    insertedNotifications,
    insertedActivityLog,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
vi.mock("@/lib/sms/actions", () => ({
  sendUrgentNotificationViaSms: smsMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  broadcastSessionStatus,
  getSessionStatusBroadcasts,
} from "../status-broadcast-actions";

// ============================================================
// Test scaffolding
// ============================================================

interface MockOptions {
  /** Whether the caller is assigned to the session. */
  isAssigned?: boolean;
  /** Auth user id returned by getUser. */
  callerId?: string;
  /** Admin/ops cohort returned by profiles role lookup. */
  opsUsers?: Array<{ id: string }>;
  /** Centre director user ids via client_user_centres. */
  centreDirectorIds?: string[];
  /** Booking parent_profiles.id values for the session. */
  bookingParentIds?: string[];
  /** parent_profiles.user_id mapping for parent_id lookups. */
  parentUserMap?: Record<string, string>;
  /** Existing broadcasts for getSessionStatusBroadcasts. */
  existingBroadcasts?: Array<Record<string, unknown>>;
}

function setupMocks(opts: MockOptions = {}) {
  const {
    isAssigned = true,
    callerId = "coach-1",
    opsUsers = [{ id: "admin-1" }, { id: "ops-1" }],
    centreDirectorIds = ["director-1"],
    bookingParentIds = ["parent-pp-1"],
    parentUserMap = { "parent-pp-1": "parent-user-1" },
    existingBroadcasts = [],
  } = opts;

  insertedBroadcasts.length = 0;
  insertedNotifications.length = 0;
  insertedActivityLog.length = 0;

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: callerId } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "session_coaches") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: isAssigned ? { user_id: callerId } : null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "session_status_broadcasts") {
      return {
        insert: (row: Record<string, unknown>) => {
          insertedBroadcasts.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "broadcast-1" },
                  error: null,
                }),
            }),
          };
        },
        select: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({
                data: existingBroadcasts,
                error: null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unmocked supabase table: ${table}`);
  });

  adminMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      // Two access paths: coach name lookup + ops cohort
      return {
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { name: "Coach Alice" },
                error: null,
              }),
          }),
          in: (col: string) => ({
            eq: () =>
              Promise.resolve({
                data: opsUsers,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: "session-1",
                  centre_id: "centre-1",
                  date: "2026-06-18",
                  time: "16:00:00",
                },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "client_user_centres") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: centreDirectorIds.map((id) => ({
                client_users: { user_id: id },
              })),
              error: null,
            }),
        }),
      };
    }
    if (table === "bookable_sessions") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [{ id: "bs-1" }],
              error: null,
            }),
        }),
      };
    }
    if (table === "bookings") {
      return {
        select: () => ({
          in: () => ({
            neq: () =>
              Promise.resolve({
                data: bookingParentIds.map((id) => ({
                  parent_id: id,
                  status: "confirmed",
                })),
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "parent_profiles") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: Object.entries(parentUserMap).map(([_id, user_id]) => ({
                user_id,
              })),
              error: null,
            }),
        }),
      };
    }
    if (table === "notifications") {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          insertedNotifications.push(rows);
          return {
            select: () =>
              Promise.resolve({
                data: rows.map((_, i) => ({
                  id: `notif-${i}`,
                  user_id: rows[i].user_id,
                })),
                error: null,
              }),
          };
        },
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: Record<string, unknown>) => {
          insertedActivityLog.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unmocked admin table: ${table}`);
  });

  smsMock.mockResolvedValue({ id: "sms-1", error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Cases
// ============================================================

describe("broadcastSessionStatus", () => {
  it("rejects unauthenticated callers", async () => {
    setupMocks();
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await broadcastSessionStatus({
      sessionId: "session-1",
      status: "on_site",
    });
    expect(result.id).toBeNull();
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("rejects a coach not assigned to the session", async () => {
    setupMocks({ isAssigned: false });
    const result = await broadcastSessionStatus({
      sessionId: "session-1",
      status: "on_site",
    });
    expect(result.id).toBeNull();
    expect(result.error).toMatch(/assigned/i);
    expect(insertedBroadcasts).toHaveLength(0);
  });

  it("running_late fans out to ops + centre + parents by default", async () => {
    setupMocks();
    const result = await broadcastSessionStatus({
      sessionId: "session-1",
      status: "running_late",
      lateMinutes: 10,
    });
    expect(result.error).toBeNull();
    expect(result.id).toBe("broadcast-1");
    expect(insertedNotifications).toHaveLength(1);
    const recipients = insertedNotifications[0].map((n) => n.user_id);
    // ops cohort + centre director + parent (via parent_profiles.user_id)
    expect(recipients).toContain("admin-1");
    expect(recipients).toContain("ops-1");
    expect(recipients).toContain("director-1");
    expect(recipients).toContain("parent-user-1");
  });

  it("on_site fans out to centre + admin/ops (no parents)", async () => {
    setupMocks();
    await broadcastSessionStatus({
      sessionId: "session-1",
      status: "on_site",
    });
    const recipients = insertedNotifications[0].map((n) => n.user_id);
    expect(recipients).toContain("admin-1");
    expect(recipients).toContain("director-1");
    expect(recipients).not.toContain("parent-user-1");
  });

  it("session_over defaults to admin-only fan-out", async () => {
    setupMocks();
    await broadcastSessionStatus({
      sessionId: "session-1",
      status: "session_over",
    });
    const recipients = insertedNotifications[0].map((n) => n.user_id);
    expect(recipients).toContain("admin-1");
    expect(recipients).toContain("ops-1");
    expect(recipients).not.toContain("director-1");
    expect(recipients).not.toContain("parent-user-1");
  });

  it("custom broadcast_to array is honoured (parents-only)", async () => {
    setupMocks();
    await broadcastSessionStatus({
      sessionId: "session-1",
      status: "on_site",
      broadcastTo: ["parents"],
    });
    const recipients = insertedNotifications[0].map((n) => n.user_id);
    expect(recipients).toEqual(["parent-user-1"]);
  });

  it("SMS escalation fires for opted-in admins on running_late", async () => {
    setupMocks();
    await broadcastSessionStatus({
      sessionId: "session-1",
      status: "running_late",
      lateMinutes: 15,
    });
    // smsMock is called once per inserted notification (the helper
    // itself decides whether to actually send based on opt-in).
    expect(smsMock).toHaveBeenCalled();
    expect(smsMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("writes an activity_log audit row", async () => {
    setupMocks();
    await broadcastSessionStatus({
      sessionId: "session-1",
      status: "on_site",
      message: "Arrived early",
    });
    expect(insertedActivityLog).toHaveLength(1);
    expect(insertedActivityLog[0].action).toBe(
      "coach_session_status_broadcast",
    );
    expect(insertedActivityLog[0].entity_id).toBe("session-1");
  });

  it("records late_minutes on the broadcast row when status=running_late", async () => {
    setupMocks();
    await broadcastSessionStatus({
      sessionId: "session-1",
      status: "running_late",
      lateMinutes: 20,
    });
    expect(insertedBroadcasts[0].late_minutes).toBe(20);
    expect(insertedBroadcasts[0].status).toBe("running_late");
  });

  it("rejects running_late without an allowed lateMinutes value", async () => {
    setupMocks();
    const result = await broadcastSessionStatus({
      sessionId: "session-1",
      status: "running_late",
      lateMinutes: 7,
    });
    expect(result.id).toBeNull();
    expect(result.error).toMatch(/lateMinutes/);
    expect(insertedBroadcasts).toHaveLength(0);
  });
});

describe("getSessionStatusBroadcasts", () => {
  it("returns broadcasts filtered by session and flattens profile name", async () => {
    setupMocks({
      existingBroadcasts: [
        {
          id: "b1",
          session_id: "session-1",
          coach_id: "coach-1",
          status: "on_site",
          late_minutes: null,
          message: "On the way in",
          broadcast_to: ["centre", "admin"],
          created_at: "2026-06-18T10:00:00.000Z",
          profiles: { name: "Coach Alice" },
        },
      ],
    });
    const result = await getSessionStatusBroadcasts("session-1");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].coach_name).toBe("Coach Alice");
    expect(result.data[0].status).toBe("on_site");
    expect(result.data[0].message).toBe("On the way in");
  });
});
