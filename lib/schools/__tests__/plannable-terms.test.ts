import { describe, expect, it } from "vitest";
import { pickPlanningTerm, plannableTerms, termTiming } from "../plannable-terms";

const t = (id: string, start: string, end: string, status: string) => ({ id, name: id, start_date: start, end_date: end, status });
const TERMS = [
  t("t1-27", "2027-01-28", "2027-04-09", "draft"),
  t("t2-26", "2026-04-27", "2026-07-03", "completed"),
  t("t3-26", "2026-07-20", "2026-09-25", "active"),
  t("t4-26", "2026-10-12", "2026-12-17", "draft"),
];
const TODAY = "2026-09-21";

describe("plannableTerms", () => {
  it("is this term and the ones after it, in date order — never a completed one", () => {
    expect(plannableTerms(TERMS, TODAY).map((x) => x.id)).toEqual(["t3-26", "t4-26", "t1-27"]);
  });

  it("drops a term whose last day has passed even if nobody marked it completed", () => {
    expect(plannableTerms(TERMS, "2026-10-01").map((x) => x.id)).toEqual(["t4-26", "t1-27"]);
  });

  it("reaches at most four terms ahead", () => {
    const many = Array.from({ length: 7 }, (_, i) => t(`x${i}`, `203${i}-02-01`, `203${i}-04-01`, "draft"));
    expect(plannableTerms(many, TODAY)).toHaveLength(4);
  });
});

describe("pickPlanningTerm", () => {
  it("honours a plannable term id, and ignores a completed or unknown one", () => {
    expect(pickPlanningTerm(TERMS, TODAY, "t1-27")?.id).toBe("t1-27");
    expect(pickPlanningTerm(TERMS, TODAY, "t2-26")?.id).toBe("t3-26");
    expect(pickPlanningTerm(TERMS, TODAY, "nope")?.id).toBe("t3-26");
  });

  it("defaults to the active term; in the holidays, to the next one", () => {
    expect(pickPlanningTerm(TERMS, TODAY)?.id).toBe("t3-26");
    expect(pickPlanningTerm(TERMS, "2026-10-01")?.id).toBe("t4-26");
    expect(pickPlanningTerm([], TODAY)).toBeNull();
  });
});

describe("termTiming", () => {
  it("reads as a teacher would say it", () => {
    expect(termTiming(TERMS[2], TODAY)).toBe("This term");
    expect(termTiming(TERMS[3], TODAY)).toBe("Starts in 3 weeks");
    expect(termTiming(TERMS[3], "2026-10-11")).toBe("Starts tomorrow");
    expect(termTiming(TERMS[3], "2026-10-05")).toBe("Starts in 7 days");
    expect(termTiming(TERMS[0], TODAY)).toBe("Starts 28 Jan 2027");
  });
});
