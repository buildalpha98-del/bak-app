import { describe, expect, it } from "vitest";
import { buildCoverageBoard, type CoverageSession } from "../coverage-model";

const term = { start_date: "2026-10-12", end_date: "2026-12-17" }; // 10 weeks
const centres = [
  { id: "a", name: "Al Bayan Liverpool", type: "school", had_last_term: true },
  { id: "b", name: "Birds Of Paradise", type: "childcare_centre", had_last_term: true },
  { id: "c", name: "New Centre", type: "childcare_centre", had_last_term: false },
];
const s = (o: Partial<CoverageSession> & { date: string }): CoverageSession => ({
  centre_id: "a",
  status: "draft",
  coach_id: "abz",
  program_id: null,
  ...o,
});

describe("buildCoverageBoard", () => {
  it("lays out every centre against every week of the term", () => {
    const board = buildCoverageBoard(term, centres, []);
    expect(board.weeks).toHaveLength(10);
    expect(board.weeks[0]).toBe("2026-10-12");
    expect(board.rows).toHaveLength(3);
    expect(board.rows[0].cells.every((c) => c.state === "none")).toBe(true);
  });

  it("names the state of a week in order of what is wrong first", () => {
    const board = buildCoverageBoard(term, centres, [
      s({ date: "2026-10-14", coach_id: null }), // week 1: someone has no coach
      s({ date: "2026-10-21" }), // week 2: drafts
      s({ date: "2026-10-28", status: "published" }), // week 3: waiting on confirmation
      s({ date: "2026-11-04", status: "confirmed", program_id: "p" }), // week 4: ready
      s({ date: "2026-11-11", status: "cancelled" }), // week 5: all cancelled
      s({ date: "2026-11-18", status: "confirmed" }),
      s({ date: "2026-11-18", status: "draft", coach_id: null }), // week 6: mixed → unassigned wins
    ]);
    const states = board.rows.find((r) => r.centre.id === "a")!.cells.map((c) => c.state);
    expect(states.slice(0, 6)).toEqual(["unassigned", "draft", "unconfirmed", "ready", "cancelled", "unassigned"]);
  });

  it("puts centres that ran last term but have nothing at the top, and counts them", () => {
    const board = buildCoverageBoard(term, centres, [s({ centre_id: "a", date: "2026-10-14" })]);
    expect(board.rows.map((r) => r.centre.id)).toEqual(["b", "a", "c"]);
    expect(board.rows[0].missing).toBe(true);
    expect(board.totals.centres_missing).toBe(1);
    // A brand-new centre with nothing is not "missing".
    expect(board.rows[2].missing).toBe(false);
  });

  it("readiness is the share of live sessions both confirmed and programmed", () => {
    const board = buildCoverageBoard(term, centres, [
      s({ date: "2026-10-14", status: "confirmed", program_id: "p" }),
      s({ date: "2026-10-14", status: "confirmed" }),
      s({ date: "2026-10-15", status: "published", program_id: "p" }),
      s({ date: "2026-10-16", status: "cancelled", program_id: "p" }),
    ]);
    expect(board.totals).toMatchObject({ sessions: 3, ready: 2, unconfirmed: 1, programmed: 2, readiness_percent: 33 });
  });

  it("ignores sessions outside the term's dates, whatever their term_id says", () => {
    const board = buildCoverageBoard(term, centres, [s({ date: "2026-09-23" }), s({ date: "2027-02-03" })]);
    expect(board.totals.sessions).toBe(0);
  });
});
