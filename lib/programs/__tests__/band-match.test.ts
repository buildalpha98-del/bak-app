import { describe, it, expect } from "vitest";
import {
  programBands,
  bandsForYearGroups,
  bandMatchScore,
} from "@/lib/programs/band-match";

describe("programBands", () => {
  it("prefers the multi-age jsonb over the legacy column", () => {
    expect(programBands({ age_group: "3-5", age_groups: ["5-8", "8-12"] })).toEqual([
      "5-8",
      "8-12",
    ]);
  });
  it("falls back to the legacy age_group", () => {
    expect(programBands({ age_group: "8-12", age_groups: [] })).toEqual(["8-12"]);
    expect(programBands({ age_group: "8-12", age_groups: null })).toEqual(["8-12"]);
  });
  it("returns empty for an untagged programme", () => {
    expect(programBands({ age_group: null, age_groups: [] })).toEqual([]);
  });
  it("ignores non-string junk in age_groups", () => {
    expect(programBands({ age_groups: [3, "5-8", null] })).toEqual(["5-8"]);
  });
});

describe("bandsForYearGroups", () => {
  it("maps K-2 to 5-8 and 3-6 to 8-12, deduped", () => {
    expect(bandsForYearGroups(["K", "1"])).toEqual(["5-8"]);
    expect(bandsForYearGroups(["3", "5/6"])).toEqual(["8-12"]);
    expect(bandsForYearGroups(["1", "4"])).toEqual(["5-8", "8-12"]);
  });
});

describe("bandMatchScore", () => {
  it("scores 1 on any overlap, 0 otherwise", () => {
    expect(bandMatchScore(["5-8", "8-12"], ["8-12"])).toBe(1);
    expect(bandMatchScore(["3-5"], ["8-12"])).toBe(0);
  });
  it("is neutral (0) when either side is unknown", () => {
    expect(bandMatchScore([], ["8-12"])).toBe(0);
    expect(bandMatchScore(["8-12"], [])).toBe(0);
  });
});
