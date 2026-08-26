import { describe, it, expect } from "vitest";
import { yearGroupToAgeBand, yearGroupSortKey } from "@/lib/schools/year-groups";

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
