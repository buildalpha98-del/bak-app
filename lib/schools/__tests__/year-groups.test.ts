import { describe, it, expect } from "vitest";
import {
  yearGroupToAgeBand,
  yearGroupSortKey,
  yearGroupToStage,
  yearGroupLabel,
} from "@/lib/schools/year-groups";

describe("yearGroupToAgeBand", () => {
  it("maps K-2 to the junior band", () => {
    expect(yearGroupToAgeBand("K")).toBe("5-8");
    expect(yearGroupToAgeBand("k")).toBe("5-8");
    expect(yearGroupToAgeBand("1")).toBe("5-8");
    expect(yearGroupToAgeBand("2")).toBe("5-8");
  });

  it("maps 3-6 to the senior band", () => {
    expect(yearGroupToAgeBand("3")).toBe("8-12");
    expect(yearGroupToAgeBand("6")).toBe("8-12");
  });

  it("maps 7-10 to the secondary band, composites by the older year (migration 094)", () => {
    expect(yearGroupToAgeBand("7")).toBe("12-16");
    expect(yearGroupToAgeBand("10")).toBe("12-16");
    expect(yearGroupToAgeBand("6/7")).toBe("12-16");
  });

  it("composites take the older band", () => {
    expect(yearGroupToAgeBand("5/6")).toBe("8-12");
    expect(yearGroupToAgeBand("2/3")).toBe("8-12");
    expect(yearGroupToAgeBand("K/1")).toBe("5-8");
  });

  it("unparseable input falls back to the senior band", () => {
    expect(yearGroupToAgeBand("")).toBe("8-12");
    expect(yearGroupToAgeBand("??")).toBe("8-12");
  });

  it("reads embedded year numbers, not NSW stage labels", () => {
    // "Year 2" parses the 2 → junior. (NSW "Stage 2" would mean Years
    // 3-4, but the input contract is year groups — the UI offers K-6.)
    expect(yearGroupToAgeBand("Year 2")).toBe("5-8");
  });

  it("passes platform age bands through untouched (childcare rooms)", () => {
    // A childcare room's group IS a band — "3-5" must not be read as
    // "years 3 and 5" (which the K-6 parser would map to 8-12).
    expect(yearGroupToAgeBand("3-5")).toBe("3-5");
    expect(yearGroupToAgeBand("5-8")).toBe("5-8");
    expect(yearGroupToAgeBand("8-12")).toBe("8-12");
  });
});

describe("yearGroupSortKey", () => {
  it("orders K before numbered years and composites by youngest year", () => {
    const sorted = ["3", "K", "5/6", "1"].sort(
      (a, b) => yearGroupSortKey(a) - yearGroupSortKey(b)
    );
    expect(sorted).toEqual(["K", "1", "3", "5/6"]);
  });

  it("pushes unparseable groups to the end", () => {
    expect(yearGroupSortKey("??")).toBe(99);
  });
});

describe("Victorian first year (migration 095)", () => {
  it("parses F / P / Prep / Foundation as year 0", () => {
    expect(yearGroupToStage("F")).toBe("Early Stage 1");
    expect(yearGroupToStage("Prep")).toBe("Early Stage 1");
    expect(yearGroupToStage("Foundation")).toBe("Early Stage 1");
    expect(yearGroupToStage("P/1")).toBe("Stage 1");
    expect(yearGroupToAgeBand("Prep")).toBe("5-8");
    expect(yearGroupSortKey("Prep")).toBe(0);
  });

  it("labels it Prep, and leaves other groups alone", () => {
    expect(yearGroupLabel("Prep")).toBe("Prep");
    expect(yearGroupLabel("F")).toBe("Prep");
    expect(yearGroupLabel("K")).toBe("Year K");
    expect(yearGroupLabel("3")).toBe("Year 3");
    expect(yearGroupLabel("3-5")).toBe("Ages 3-5");
  });
});

describe("yearGroupToStage — secondary (migration 094)", () => {
  it("maps Years 7-8 to Stage 4 and 9-10 to Stage 5", () => {
    expect(yearGroupToStage("7")).toBe("Stage 4");
    expect(yearGroupToStage("8")).toBe("Stage 4");
    expect(yearGroupToStage("9")).toBe("Stage 5");
    expect(yearGroupToStage("10")).toBe("Stage 5");
    expect(yearGroupToStage("Year 10")).toBe("Stage 5");
  });
  it("still ignores years past 10", () => {
    expect(yearGroupToStage("11")).toBeNull();
  });
});
