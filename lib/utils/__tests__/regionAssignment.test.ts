import { describe, it, expect } from "vitest";
import { assignRegionBySuburb } from "../regionAssignment";
import type { RegionSuburbEntry } from "../regionAssignment";

// ============================================================
// Test data
// ============================================================

const REGIONS: RegionSuburbEntry[] = [
  {
    id: "region-1",
    name: "South-West Sydney",
    suburbs: ["Bankstown", "Liverpool", "Fairfield", "Cabramatta", "Campbelltown"],
    status: "active",
  },
  {
    id: "region-2",
    name: "Inner West",
    suburbs: ["Strathfield", "Burwood", "Ashfield", "Croydon"],
    status: "active",
  },
  {
    id: "region-3",
    name: "Western Sydney",
    suburbs: ["Parramatta", "Blacktown", "Penrith", "Mount Druitt"],
    status: "active",
  },
  {
    id: "region-4",
    name: "Northern Expansion",
    suburbs: ["Chatswood", "Hornsby", "Macquarie Park"],
    status: "planned",
  },
  {
    id: "region-5",
    name: "Decommissioned",
    suburbs: ["Wollongong", "Shellharbour"],
    status: "inactive",
  },
];

// ============================================================
// assignRegionBySuburb
// ============================================================

describe("assignRegionBySuburb", () => {
  // ---- Exact matches ----

  it("matches a suburb to the correct region", () => {
    const result = assignRegionBySuburb("Bankstown", REGIONS);

    expect(result).not.toBeNull();
    expect(result!.regionId).toBe("region-1");
    expect(result!.regionName).toBe("South-West Sydney");
  });

  it("matches suburbs in different regions", () => {
    const result1 = assignRegionBySuburb("Strathfield", REGIONS);
    expect(result1!.regionId).toBe("region-2");

    const result2 = assignRegionBySuburb("Parramatta", REGIONS);
    expect(result2!.regionId).toBe("region-3");
  });

  // ---- Case insensitive ----

  it("matches case-insensitively (lowercase input)", () => {
    const result = assignRegionBySuburb("bankstown", REGIONS);
    expect(result).not.toBeNull();
    expect(result!.regionId).toBe("region-1");
  });

  it("matches case-insensitively (uppercase input)", () => {
    const result = assignRegionBySuburb("LIVERPOOL", REGIONS);
    expect(result).not.toBeNull();
    expect(result!.regionId).toBe("region-1");
  });

  it("matches case-insensitively (mixed case input)", () => {
    const result = assignRegionBySuburb("bUrWoOd", REGIONS);
    expect(result).not.toBeNull();
    expect(result!.regionId).toBe("region-2");
  });

  // ---- Whitespace handling ----

  it("trims leading and trailing whitespace", () => {
    const result = assignRegionBySuburb("  Bankstown  ", REGIONS);
    expect(result).not.toBeNull();
    expect(result!.regionId).toBe("region-1");
  });

  // ---- No match ----

  it("returns null for an unrecognised suburb", () => {
    const result = assignRegionBySuburb("Bondi", REGIONS);
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    const result = assignRegionBySuburb("", REGIONS);
    expect(result).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    const result = assignRegionBySuburb("   ", REGIONS);
    expect(result).toBeNull();
  });

  // ---- Only active regions ----

  it("does not match against planned regions", () => {
    const result = assignRegionBySuburb("Chatswood", REGIONS);
    expect(result).toBeNull();
  });

  it("does not match against inactive regions", () => {
    const result = assignRegionBySuburb("Wollongong", REGIONS);
    expect(result).toBeNull();
  });

  // ---- Edge cases ----

  it("returns null when regions array is empty", () => {
    const result = assignRegionBySuburb("Bankstown", []);
    expect(result).toBeNull();
  });

  it("returns the first matching region when suburb appears in multiple", () => {
    // Add a duplicate suburb to a second region
    const regionsWithDupe: RegionSuburbEntry[] = [
      ...REGIONS,
      {
        id: "region-6",
        name: "Duplicate Region",
        suburbs: ["Bankstown"],
        status: "active",
      },
    ];

    const result = assignRegionBySuburb("Bankstown", regionsWithDupe);
    // Should return the first match (region-1)
    expect(result!.regionId).toBe("region-1");
  });

  it("handles region with empty suburbs array", () => {
    const regionsWithEmpty: RegionSuburbEntry[] = [
      {
        id: "region-empty",
        name: "Empty Region",
        suburbs: [],
        status: "active",
      },
    ];

    const result = assignRegionBySuburb("Bankstown", regionsWithEmpty);
    expect(result).toBeNull();
  });

  it("handles suburbs with extra whitespace in region data", () => {
    const regionsWithSpaces: RegionSuburbEntry[] = [
      {
        id: "region-spaces",
        name: "Spaced Region",
        suburbs: [" Bankstown ", "  Liverpool"],
        status: "active",
      },
    ];

    const result = assignRegionBySuburb("Bankstown", regionsWithSpaces);
    expect(result).not.toBeNull();
    expect(result!.regionId).toBe("region-spaces");
  });
});
