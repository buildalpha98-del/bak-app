import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getBookingsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — per-table mock routing
// ============================================================
//
// The action fans out four head-count queries:
//   1. `bookable_sessions` head count where date=YYYY-MM-DD
//   2. `waitlist` head count where expires_at between now and +24h
//   3. `package_balances` head count where status='active' AND
//      remaining_sessions <= 2
//   4. `bookings` head count where status='confirmed' AND
//      booked_at >= Monday
//
// Each fixture sets the count returned at the leaf of the chain.

interface PulseFixture {
  todaysSessions?: number;
  waitlistExpiring?: number;
  packagesLow?: number;
  newBookings?: number;
}

function installFixture(opts: PulseFixture) {
  const todaysSessions = opts.todaysSessions ?? 0;
  const waitlistExpiring = opts.waitlistExpiring ?? 0;
  const packagesLow = opts.packagesLow ?? 0;
  const newBookings = opts.newBookings ?? 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "bookable_sessions") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => ({
          eq: () =>
            Promise.resolve({
              count: opts2?.head ? todaysSessions : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "waitlist") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => ({
          gte: () => ({
            lte: () =>
              Promise.resolve({
                count: opts2?.head ? waitlistExpiring : 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "package_balances") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => ({
          eq: () => ({
            lte: () =>
              Promise.resolve({
                count: opts2?.head ? packagesLow : 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "bookings") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? newBookings : 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getBookingsStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getBookingsStatusPulse();
    expect(pulse).toEqual({
      todaysSessionsCount: 0,
      waitlistExpiringCount: 0,
      packagesLowCount: 0,
      newBookingsThisWeekCount: 0,
    });
  });

  it("passes today's sessions head count through", async () => {
    installFixture({ todaysSessions: 3 });
    const pulse = await getBookingsStatusPulse();
    expect(pulse.todaysSessionsCount).toBe(3);
  });

  it("passes the waitlist-expiring head count through", async () => {
    installFixture({ waitlistExpiring: 5 });
    const pulse = await getBookingsStatusPulse();
    expect(pulse.waitlistExpiringCount).toBe(5);
  });

  it("passes the packages-low head count through", async () => {
    installFixture({ packagesLow: 7 });
    const pulse = await getBookingsStatusPulse();
    expect(pulse.packagesLowCount).toBe(7);
  });

  it("passes the new-bookings-this-week head count through", async () => {
    installFixture({ newBookings: 12 });
    const pulse = await getBookingsStatusPulse();
    expect(pulse.newBookingsThisWeekCount).toBe(12);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getBookingsStatusPulse();
    expect(pulse).toEqual({
      todaysSessionsCount: 0,
      waitlistExpiringCount: 0,
      packagesLowCount: 0,
      newBookingsThisWeekCount: 0,
    });
  });
});
