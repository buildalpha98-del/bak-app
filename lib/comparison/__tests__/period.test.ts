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

import { resolvePeriod, resolveComparisonPeriod } from "../period";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

/**
 * Helper: stub the terms-table queries with a fixed pair of rows.
 * `current` is what status='active' returns; `prior` is what the
 * `lt('end_date', current.start_date)` query returns. Either can
 * be null to simulate an empty database / fallback path.
 */
function mockTermsQueries(opts: {
  current?: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    year: number;
    status: string;
  } | null;
  prior?: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
  } | null;
}) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "terms") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select: () => ({
        // Active-status branch
        eq: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: opts.current ? [opts.current] : [],
                error: null,
              }),
          }),
        }),
        // Last-term (lt end_date) branch
        lt: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: opts.prior ? [opts.prior] : [],
                error: null,
              }),
          }),
        }),
        // Fallback "no active term, just take most recent" branch
        order: () => ({
          limit: () =>
            Promise.resolve({
              data: opts.current ? [opts.current] : [],
              error: null,
            }),
        }),
      }),
    };
  });
}

describe("resolvePeriod — terms", () => {
  it("'this_term' resolves to the current active term", async () => {
    mockTermsQueries({
      current: {
        id: "t-2",
        name: "Term 2 2026",
        start_date: "2026-05-01",
        end_date: "2026-07-04",
        year: 2026,
        status: "active",
      },
    });
    const p = await resolvePeriod("this_term");
    expect(p.key).toBe("this_term");
    expect(p.start).toBe("2026-05-01");
    expect(p.end).toBe("2026-07-04");
    expect(p.label).toBe("Term 2 2026");
  });

  it("'last_term' resolves to the prior term", async () => {
    mockTermsQueries({
      current: {
        id: "t-2",
        name: "Term 2 2026",
        start_date: "2026-05-01",
        end_date: "2026-07-04",
        year: 2026,
        status: "active",
      },
      prior: {
        id: "t-1",
        name: "Term 1 2026",
        start_date: "2026-02-01",
        end_date: "2026-04-10",
      },
    });
    const p = await resolvePeriod("last_term");
    expect(p.start).toBe("2026-02-01");
    expect(p.end).toBe("2026-04-10");
    expect(p.label).toBe("Term 1 2026");
  });

  it("falls back to a calendar quarter when the terms table is empty", async () => {
    mockTermsQueries({ current: null, prior: null });
    const p = await resolvePeriod("this_term");
    // Calendar-quarter fallback always returns ISO dates that align
    // to the first/last day of a quarter (months 1/4/7/10).
    expect(p.start).toMatch(/^\d{4}-(01|04|07|10)-01$/);
    expect(p.end).toMatch(/^\d{4}-(03|06|09|12)-\d{2}$/);
  });
});

describe("resolvePeriod — calendar buckets", () => {
  it("'this_week' returns a Monday-anchored 7-day window", async () => {
    // Fix the clock to a Wednesday in Sydney (15 Oct 2025).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-15T03:00:00Z")); // 14:00 Sydney
    const p = await resolvePeriod("this_week");
    expect(p.start).toBe("2025-10-13"); // Monday
    expect(p.end).toBe("2025-10-19"); // Sunday
    expect(p.label).toBe("This week");
  });

  it("'last_week' returns the 7 days before this Monday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-15T03:00:00Z"));
    const p = await resolvePeriod("last_week");
    expect(p.start).toBe("2025-10-06");
    expect(p.end).toBe("2025-10-12");
  });

  it("handles February month boundaries correctly (non-leap)", async () => {
    vi.useFakeTimers();
    // 5 March 2025 — Sydney
    vi.setSystemTime(new Date("2025-03-05T03:00:00Z"));
    const lastMonth = await resolvePeriod("last_month");
    expect(lastMonth.start).toBe("2025-02-01");
    expect(lastMonth.end).toBe("2025-02-28");
  });

  it("handles February month boundaries correctly (leap year)", async () => {
    vi.useFakeTimers();
    // 5 March 2024 — leap year, Feb has 29 days.
    vi.setSystemTime(new Date("2024-03-05T03:00:00Z"));
    const lastMonth = await resolvePeriod("last_month");
    expect(lastMonth.start).toBe("2024-02-01");
    expect(lastMonth.end).toBe("2024-02-29");
  });

  it("resolves quarter boundaries cleanly", async () => {
    vi.useFakeTimers();
    // 15 May 2026 — Q2.
    vi.setSystemTime(new Date("2026-05-15T03:00:00Z"));
    const thisQ = await resolvePeriod("this_quarter");
    expect(thisQ.start).toBe("2026-04-01");
    expect(thisQ.end).toBe("2026-06-30");
    const lastQ = await resolvePeriod("last_quarter");
    expect(lastQ.start).toBe("2026-01-01");
    expect(lastQ.end).toBe("2026-03-31");
  });

  it("handles Sydney DST transitions without losing/gaining a day", async () => {
    vi.useFakeTimers();
    // 2025-10-05 is the AEST→AEDT DST start in Sydney. Anchor a
    // week boundary across it and confirm Mon-Sun is still 7 days.
    vi.setSystemTime(new Date("2025-10-08T03:00:00Z"));
    const p = await resolvePeriod("this_week");
    // Monday 6 Oct → Sunday 12 Oct, despite the DST jump on the 5th.
    expect(p.start).toBe("2025-10-06");
    expect(p.end).toBe("2025-10-12");
  });
});

describe("resolveComparisonPeriod", () => {
  it("maps this_X to last_X for calendar buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T03:00:00Z"));
    const p = await resolveComparisonPeriod("this_week");
    expect(p.key).toBe("last_week");
  });
});
