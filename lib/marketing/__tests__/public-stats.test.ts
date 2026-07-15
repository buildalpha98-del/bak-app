import { describe, it, expect } from "vitest";
import { pickCurrentTerm, type TermRow } from "../public-stats";

const term = (overrides: Partial<TermRow>): TermRow => ({
  id: "t1",
  start_date: "2026-01-28",
  end_date: "2026-04-09",
  status: "draft",
  ...overrides,
});

describe("pickCurrentTerm", () => {
  it("prefers the admin-flagged active term over a date-window match", () => {
    const terms = [
      term({ id: "stale-active", status: "active" }),
      term({
        id: "t3",
        start_date: "2026-07-14",
        end_date: "2026-09-25",
        status: "draft",
      }),
    ];
    expect(pickCurrentTerm(terms, "2026-07-15")?.id).toBe("stale-active");
  });

  it("falls back to the term whose window contains today when none is active", () => {
    const terms = [
      term({ id: "t1", status: "completed" }),
      term({
        id: "t3",
        start_date: "2026-07-14",
        end_date: "2026-09-25",
        status: "draft",
      }),
    ];
    expect(pickCurrentTerm(terms, "2026-07-15")?.id).toBe("t3");
  });

  it("treats the window as inclusive on both boundaries", () => {
    const terms = [
      term({ id: "t3", start_date: "2026-07-14", end_date: "2026-09-25" }),
    ];
    expect(pickCurrentTerm(terms, "2026-07-14")?.id).toBe("t3");
    expect(pickCurrentTerm(terms, "2026-09-25")?.id).toBe("t3");
    expect(pickCurrentTerm(terms, "2026-09-26")?.id).toBe("t3"); // most-recent-started fallback
    expect(pickCurrentTerm(terms, "2026-07-13")).toBeNull(); // not started yet
  });

  it("falls back to the most recently started term when today is between terms", () => {
    const terms = [
      term({ id: "t1", status: "completed" }),
      term({
        id: "t2",
        start_date: "2026-04-27",
        end_date: "2026-07-03",
        status: "completed",
      }),
    ];
    // 2026-07-15 is in the T2→T3 school holidays
    expect(pickCurrentTerm(terms, "2026-07-15")?.id).toBe("t2");
  });

  it("returns null when there are no terms or none has begun", () => {
    expect(pickCurrentTerm([], "2026-07-15")).toBeNull();
    const future = [
      term({ id: "t4", start_date: "2026-10-12", end_date: "2026-12-18" }),
    ];
    expect(pickCurrentTerm(future, "2026-07-15")).toBeNull();
  });
});
