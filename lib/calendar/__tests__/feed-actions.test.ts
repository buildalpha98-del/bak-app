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

import {
  getCoachEvents,
  getParentEvents,
  getCentreEvents,
} from "../feed-actions";
import {
  generateCalendarToken,
  verifyCalendarToken,
} from "../token";

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Build a tiny chainable mock that resolves once `await`-ed. We don't try to
 * mimic the full Supabase fluent API — just the methods each feed-action
 * happens to call, returning the supplied dataset.
 */
function installRows(rows: unknown[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: rows, error: null }),
  };
  supabaseMock.from.mockReturnValue(builder);
  return builder;
}

const FAR_FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30); // 30 days forward — inside default 8w window
  return d.toISOString().split("T")[0];
})();

describe("getCoachEvents", () => {
  it("joins through session_coaches and maps each row to a CalendarEvent", async () => {
    installRows([
      {
        sessions: {
          id: "sess-1",
          date: FAR_FUTURE_DATE,
          time: "10:00",
          duration_minutes: 60,
          sport: "Soccer",
          status: "confirmed",
          notes: null,
          programs: { title: "Soccer Fundamentals" },
          centres: { name: "Tiny Tots", address: "1 Main St" },
        },
      },
      {
        sessions: {
          id: "sess-2",
          date: FAR_FUTURE_DATE,
          time: "14:00",
          duration_minutes: 45,
          sport: "Basketball",
          status: "in_progress",
          notes: "Bring extra balls",
          programs: { title: "Hoops 101" },
          centres: { name: "Lil Stars", address: "2 King St" },
        },
      },
    ]);

    const events = await getCoachEvents("coach-1");
    expect(supabaseMock.from).toHaveBeenCalledWith("session_coaches");
    expect(events).toHaveLength(2);
    expect(events[0].summary).toBe("Soccer at Tiny Tots");
    expect(events[0].description).toContain("Soccer Fundamentals");
    expect(events[0].description).toContain("Duration: 60 min");
    expect(events[0].location).toBe("1 Main St");
    expect(events[0].url).toContain("/coach/schedule?session=sess-1");
    expect(events[1].description).toContain("Notes: Bring extra balls");
  });

  it("excludes cancelled sessions", async () => {
    installRows([
      {
        sessions: {
          id: "sess-1",
          date: FAR_FUTURE_DATE,
          time: "10:00",
          duration_minutes: 60,
          sport: "Soccer",
          status: "cancelled",
          notes: null,
          programs: null,
          centres: { name: "Tiny Tots", address: "1 Main St" },
        },
      },
      {
        sessions: {
          id: "sess-2",
          date: FAR_FUTURE_DATE,
          time: "11:00",
          duration_minutes: 60,
          sport: "Soccer",
          status: "confirmed",
          notes: null,
          programs: null,
          centres: { name: "Tiny Tots", address: "1 Main St" },
        },
      },
    ]);

    const events = await getCoachEvents("coach-1");
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("session-sess-2");
  });
});

describe("getParentEvents", () => {
  it("scopes to parent_id via bookings → bookable_sessions", async () => {
    const builder = installRows([
      {
        id: "b-1",
        status: "confirmed",
        children_json: [{ child_name: "Eli" }, { child_name: "Mia" }],
        bookable_sessions: {
          id: "bs-1",
          title: "School Holiday Soccer Clinic",
          date: FAR_FUTURE_DATE,
          start_time: "09:00",
          end_time: "10:30",
          sport: "Soccer",
          location_name: "Build Alpha HQ",
          location_address: "100 Olympic Bv",
        },
      },
    ]);

    const events = await getParentEvents("parent-1");
    expect(supabaseMock.from).toHaveBeenCalledWith("bookings");
    expect(builder.eq).toHaveBeenCalledWith("parent_id", "parent-1");
    expect(builder.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Eli, Mia: Soccer");
    expect(events[0].location).toBe("Build Alpha HQ, 100 Olympic Bv");
    expect(events[0].uid).toBe("booking-b-1");
  });
});

describe("getCentreEvents", () => {
  it("scopes to centre_id and excludes cancelled rows", async () => {
    const builder = installRows([
      {
        id: "s-1",
        date: FAR_FUTURE_DATE,
        time: "09:00",
        duration_minutes: 60,
        sport: "Yoga",
        status: "confirmed",
        profiles: { name: "Sam" },
        centres: { name: "Sunny Centre", address: "5 Bay Rd" },
      },
    ]);

    const events = await getCentreEvents("centre-42");
    expect(supabaseMock.from).toHaveBeenCalledWith("sessions");
    expect(builder.eq).toHaveBeenCalledWith("centre_id", "centre-42");
    expect(builder.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Yoga (Sam)");
    expect(events[0].url).toContain("/client/centre-42");
  });
});

describe("Calendar token hmac validation", () => {
  it("verifies a token generated with the same secret", () => {
    const token = generateCalendarToken("coach", "user-uuid-aaa");
    const result = verifyCalendarToken("coach", token);
    expect(result).not.toBeNull();
    expect(result?.entityId).toBe("user-uuid-aaa");
  });

  it("rejects a forged signature", () => {
    const token = generateCalendarToken("coach", "user-uuid-aaa");
    // Flip a hex char in the signature segment.
    const lastDash = token.lastIndexOf("-");
    const sig = token.slice(lastDash + 1);
    const flipped =
      token.slice(0, lastDash + 1) +
      (sig[0] === "0" ? "1" : "0") +
      sig.slice(1);
    const result = verifyCalendarToken("coach", flipped);
    expect(result).toBeNull();
  });

  it("rejects a token with the wrong type prefix", () => {
    const token = generateCalendarToken("coach", "user-uuid-aaa");
    const result = verifyCalendarToken("parent", token);
    expect(result).toBeNull();
  });
});

describe("Default range (8 weeks forward / 4 back)", () => {
  it("filters out sessions outside the default window", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 120); // 120 days forward — outside 8w window
    const farFutureDate = future.toISOString().split("T")[0];
    installRows([
      {
        sessions: {
          id: "in-window",
          date: FAR_FUTURE_DATE,
          time: "10:00",
          duration_minutes: 60,
          sport: "Soccer",
          status: "confirmed",
          notes: null,
          programs: null,
          centres: { name: "Tiny Tots", address: "1 Main St" },
        },
      },
      {
        sessions: {
          id: "out-of-window",
          date: farFutureDate,
          time: "10:00",
          duration_minutes: 60,
          sport: "Soccer",
          status: "confirmed",
          notes: null,
          programs: null,
          centres: { name: "Tiny Tots", address: "1 Main St" },
        },
      },
    ]);

    const events = await getCoachEvents("coach-1");
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("session-in-window");
  });
});
