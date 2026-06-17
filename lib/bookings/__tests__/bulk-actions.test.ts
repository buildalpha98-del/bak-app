import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import {
  bulkCancelBookings,
  bulkActivateSessions,
  bulkPublishSessions,
} from "../admin-booking-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Auth + table shim
// ============================================================
//
// `gateAdminOrOps` reads profiles.role and rejects coach. The bulk
// actions then read the current statuses of the targeted rows and
// only flip the eligible ones. We model both stages with per-table
// fixtures and capture (a) the rows actually .update()d and (b) the
// activity_log inserts so we can assert "per-eligible-row" semantics.

interface BulkFixture {
  role: "admin" | "ops" | "coach";
  /** Map of id → status for the bookings/bookable_sessions row. */
  bookingStatuses?: Record<string, string>;
  sessionStatuses?: Record<string, string>;
}

function installFixture(opts: BulkFixture) {
  const bookingStatuses = opts.bookingStatuses ?? {};
  const sessionStatuses = opts.sessionStatuses ?? {};

  const activityLogs: Array<{ action: string; entity_id: string | null }> = [];
  const bookingUpdates: string[] = [];
  const sessionUpdates: string[] = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "actor-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { role: opts.role },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { action: string; entity_id: string | null }) => {
          activityLogs.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "bookings") {
      return {
        // Status read for eligibility check.
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids.map((id) => ({
                id,
                status: bookingStatuses[id] ?? "confirmed",
              })),
              error: null,
            }),
        }),
        // Per-id update path.
        update: () => ({
          eq: (_col: string, id: string) => {
            bookingUpdates.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "bookable_sessions") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids.map((id) => ({
                id,
                status: sessionStatuses[id] ?? "draft",
              })),
              error: null,
            }),
        }),
        update: () => ({
          eq: (_col: string, id: string) => {
            sessionUpdates.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`unexpected supabase table ${table}`);
  });

  return { activityLogs, bookingUpdates, sessionUpdates };
}

// ============================================================
// bulkCancelBookings
// ============================================================

describe("bulkCancelBookings", () => {
  it("rejects coach role (admin gate)", async () => {
    installFixture({ role: "coach" });
    const result = await bulkCancelBookings(["b1"], "weather");
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Insufficient permissions.");
  });

  it("cancels 3 confirmed bookings happily", async () => {
    const ctx = installFixture({
      role: "admin",
      bookingStatuses: {
        b1: "confirmed",
        b2: "confirmed",
        b3: "confirmed",
      },
    });
    const result = await bulkCancelBookings(["b1", "b2", "b3"], "weather");
    expect(result.updated).toBe(3);
    expect(result.error).toBeNull();
    expect(ctx.bookingUpdates).toEqual(["b1", "b2", "b3"]);
    expect(
      ctx.activityLogs.filter((l) => l.action === "booking_bulk_cancelled")
        .length
    ).toBe(3);
  });

  it("skips bookings that are already cancelled", async () => {
    const ctx = installFixture({
      role: "ops",
      bookingStatuses: {
        b1: "confirmed",
        b2: "cancelled",
        b3: "pending_payment",
      },
    });
    const result = await bulkCancelBookings(["b1", "b2", "b3"], "");
    // b1 (confirmed) + b3 (pending_payment) eligible; b2 skipped.
    expect(result.updated).toBe(2);
    expect(ctx.bookingUpdates).toEqual(["b1", "b3"]);
  });
});

// ============================================================
// bulkActivateSessions
// ============================================================

describe("bulkActivateSessions", () => {
  it("activates 3 draft sessions happily", async () => {
    const ctx = installFixture({
      role: "admin",
      sessionStatuses: {
        s1: "draft",
        s2: "closed",
        s3: "draft",
      },
    });
    const result = await bulkActivateSessions(["s1", "s2", "s3"]);
    expect(result.updated).toBe(3);
    expect(result.error).toBeNull();
    expect(ctx.sessionUpdates).toEqual(["s1", "s2", "s3"]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "bookable_session_bulk_activated"
      ).length
    ).toBe(3);
  });

  it("skips sessions that are not eligible (already open / cancelled)", async () => {
    const ctx = installFixture({
      role: "admin",
      sessionStatuses: {
        s1: "draft",
        s2: "open",
        s3: "cancelled",
        s4: "closed",
      },
    });
    const result = await bulkActivateSessions(["s1", "s2", "s3", "s4"]);
    // Only s1 (draft) + s4 (closed) flip; s2/s3 skipped.
    expect(result.updated).toBe(2);
    expect(ctx.sessionUpdates).toEqual(["s1", "s4"]);
  });
});

// ============================================================
// bulkPublishSessions
// ============================================================

describe("bulkPublishSessions", () => {
  it("publishes only draft → open (skips closed)", async () => {
    const ctx = installFixture({
      role: "ops",
      sessionStatuses: {
        s1: "draft",
        s2: "closed",
        s3: "draft",
      },
    });
    const result = await bulkPublishSessions(["s1", "s2", "s3"]);
    // s2 is closed — publish doesn't touch closed, so skipped.
    expect(result.updated).toBe(2);
    expect(ctx.sessionUpdates).toEqual(["s1", "s3"]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "bookable_session_bulk_published"
      ).length
    ).toBe(2);
  });
});
