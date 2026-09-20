import { describe, it, expect } from "vitest";
import {
  yearGroupToAgeBand,
  yearGroupSortKey,
  ageBandToStageLabel,
  stagesLabelForYearGroups,
  yearGroupToStage,
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

describe("ageBandToStageLabel", () => {
  it("maps school bands to stage ranges and pre-school to none", () => {
    expect(ageBandToStageLabel("8-12")).toBe("Stage 2 – Stage 3");
    expect(ageBandToStageLabel("12-16")).toBe("Stage 4 – Stage 5");
    expect(ageBandToStageLabel("5-8")).toBe("Early Stage 1 – Stage 1");
    expect(ageBandToStageLabel("3-5")).toBe(null);
    expect(ageBandToStageLabel(null)).toBe(null);
  });
});

describe("stagesLabelForYearGroups", () => {
  it("dedupes and orders by syllabus stage", () => {
    expect(stagesLabelForYearGroups(["4", "3"])).toBe("Stage 2");
    expect(stagesLabelForYearGroups(["K", "5/6"])).toBe("Early Stage 1, Stage 3");
    expect(stagesLabelForYearGroups(["3-5"])).toBe(null);
    expect(stagesLabelForYearGroups([])).toBe(null);
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
