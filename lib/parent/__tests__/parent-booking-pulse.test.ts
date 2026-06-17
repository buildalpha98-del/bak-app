import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getParentBookingPulse } from "../status-pulse-actions";

// ============================================================
// getParentBookingPulse() fans out across:
//   1. parent_profiles → parentId
//   2. parent_children → childIds (read but not used in this pulse)
//   3. bookable_sessions(today, open) → sessionsToday
//   4. bookable_sessions(>= today, open) → nextAvailable
//   5. waitlist head waiting/offered → onWaitlist
//   6. package_balances → packagesEndingSoon (same logic as home pulse)
// ============================================================

interface BookingFixture {
  sessionsTodayRows?: Array<{ max_capacity: number; current_bookings: number }>;
  nextAvailableRows?: Array<{
    date: string;
    max_capacity: number;
    current_bookings: number;
  }>;
  onWaitlist?: number;
  packageRows?: Array<{ expires_at: string; remaining_sessions: number }>;
}

function isoIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDateIn(days: number): string {
  return isoIn(days).split("T")[0];
}

function installFixture(opts: BookingFixture) {
  const sessionsTodayRows = opts.sessionsTodayRows ?? [];
  const nextAvailableRows = opts.nextAvailableRows ?? [];
  const onWaitlist = opts.onWaitlist ?? 0;
  const packageRows = opts.packageRows ?? [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });

  let bookableSessionsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "parent_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { id: "parent-1" }, error: null }),
          }),
        }),
      };
    }
    if (table === "parent_children") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    }
    if (table === "bookable_sessions") {
      bookableSessionsCall++;
      const isFirstCall = bookableSessionsCall === 1;
      // First call: sessionsToday — chain: .eq().eq()
      // Second call: nextAvailable — chain: .eq().gte().order().limit()
      if (isFirstCall) {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({ data: sessionsTodayRows, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({ data: nextAvailableRows, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "waitlist") {
      return {
        select: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({
                count: onWaitlist,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "package_balances") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: packageRows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getParentBookingPulse", () => {
  it("returns calm zeros when nothing is on", async () => {
    installFixture({});
    const pulse = await getParentBookingPulse();
    expect(pulse).toEqual({
      sessionsAvailableTodayCount: 0,
      nextAvailableDays: null,
      onWaitlistCount: 0,
      packagesEndingSoonCount: 0,
    });
  });

  it("returns all-zero when no auth user", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const pulse = await getParentBookingPulse();
    expect(pulse).toEqual({
      sessionsAvailableTodayCount: 0,
      nextAvailableDays: null,
      onWaitlistCount: 0,
      packagesEndingSoonCount: 0,
    });
  });

  it("counts only today-sessions with spots remaining", async () => {
    installFixture({
      sessionsTodayRows: [
        { max_capacity: 10, current_bookings: 3 },
        { max_capacity: 10, current_bookings: 10 }, // full → skip
        { max_capacity: 5, current_bookings: 2 },
      ],
    });
    const pulse = await getParentBookingPulse();
    expect(pulse.sessionsAvailableTodayCount).toBe(2);
  });

  it("computes days to next available session", async () => {
    installFixture({
      nextAvailableRows: [
        { date: isoDateIn(5), max_capacity: 10, current_bookings: 10 }, // full → skip
        { date: isoDateIn(7), max_capacity: 10, current_bookings: 4 },
      ],
    });
    const pulse = await getParentBookingPulse();
    expect(pulse.nextAvailableDays).toBe(7);
  });

  it("passes waitlist count through", async () => {
    installFixture({ onWaitlist: 4 });
    const pulse = await getParentBookingPulse();
    expect(pulse.onWaitlistCount).toBe(4);
  });

  it("flags packages ending within a week", async () => {
    installFixture({
      packageRows: [
        { expires_at: isoIn(2), remaining_sessions: 5 },
        { expires_at: isoIn(20), remaining_sessions: 5 },
      ],
    });
    const pulse = await getParentBookingPulse();
    expect(pulse.packagesEndingSoonCount).toBe(1);
  });

  it("swallows thrown errors and returns calm zeros", async () => {
    supabaseMock.auth.getUser.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getParentBookingPulse();
    expect(pulse).toEqual({
      sessionsAvailableTodayCount: 0,
      nextAvailableDays: null,
      onWaitlistCount: 0,
      packagesEndingSoonCount: 0,
    });
  });
});
