import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateAgeGroup, calculateAge } from "../ageGroup";

// ============================================================
// calculateAgeGroup
// ============================================================
// Age groups:
//   3-5  → age < 5
//   5-8  → 5 <= age < 8
//   8-12 → age >= 8

describe("calculateAgeGroup", () => {
  // Use a fixed "today" so tests are deterministic
  const FIXED_TODAY = new Date("2026-03-15T10:00:00");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- Group "3-5" ----

  describe("age group 3-5", () => {
    it("returns 3-5 for a 3-year-old", () => {
      // Born 2023-01-15 → age 3
      const dob = new Date("2023-01-15");
      expect(calculateAgeGroup(dob)).toBe("3-5");
    });

    it("returns 3-5 for a 4-year-old", () => {
      // Born 2021-06-01 → age 4
      const dob = new Date("2021-06-01");
      expect(calculateAgeGroup(dob)).toBe("3-5");
    });

    it("returns 3-5 for a child almost 5 (birthday tomorrow)", () => {
      // Born 2021-03-16 → turns 5 tomorrow → still 4
      const dob = new Date("2021-03-16");
      expect(calculateAgeGroup(dob)).toBe("3-5");
    });

    it("returns 3-5 for a 1-year-old (under 3 still maps to 3-5)", () => {
      // Born 2025-01-01 → age 1
      const dob = new Date("2025-01-01");
      expect(calculateAgeGroup(dob)).toBe("3-5");
    });

    it("returns 3-5 for a newborn", () => {
      const dob = new Date("2026-03-01");
      expect(calculateAgeGroup(dob)).toBe("3-5");
    });
  });

  // ---- Group "5-8" ----

  describe("age group 5-8", () => {
    it("returns 5-8 for a child who just turned 5 today", () => {
      // Born 2021-03-15 → turns 5 today
      const dob = new Date("2021-03-15");
      expect(calculateAgeGroup(dob)).toBe("5-8");
    });

    it("returns 5-8 for a 6-year-old", () => {
      const dob = new Date("2019-09-20");
      expect(calculateAgeGroup(dob)).toBe("5-8");
    });

    it("returns 5-8 for a 7-year-old", () => {
      const dob = new Date("2018-06-01");
      expect(calculateAgeGroup(dob)).toBe("5-8");
    });

    it("returns 5-8 for a child almost 8 (birthday tomorrow)", () => {
      // Born 2018-03-16 → turns 8 tomorrow → still 7
      const dob = new Date("2018-03-16");
      expect(calculateAgeGroup(dob)).toBe("5-8");
    });
  });

  // ---- Group "8-12" ----

  describe("age group 8-12", () => {
    it("returns 8-12 for a child who just turned 8 today", () => {
      // Born 2018-03-15 → turns 8 today
      const dob = new Date("2018-03-15");
      expect(calculateAgeGroup(dob)).toBe("8-12");
    });

    it("returns 8-12 for a 10-year-old", () => {
      const dob = new Date("2015-11-20");
      expect(calculateAgeGroup(dob)).toBe("8-12");
    });

    it("returns 8-12 for a 12-year-old", () => {
      const dob = new Date("2013-07-01");
      expect(calculateAgeGroup(dob)).toBe("8-12");
    });

    it("returns 8-12 for older children (15+)", () => {
      const dob = new Date("2010-01-01");
      expect(calculateAgeGroup(dob)).toBe("8-12");
    });
  });

  // ---- Boundary: exact birthday vs day before ----

  describe("boundary precision", () => {
    it("5th birthday today → 5-8", () => {
      const dob = new Date("2021-03-15");
      expect(calculateAgeGroup(dob)).toBe("5-8");
    });

    it("5th birthday tomorrow → still 3-5", () => {
      const dob = new Date("2021-03-16");
      expect(calculateAgeGroup(dob)).toBe("3-5");
    });

    it("8th birthday today → 8-12", () => {
      const dob = new Date("2018-03-15");
      expect(calculateAgeGroup(dob)).toBe("8-12");
    });

    it("8th birthday tomorrow → still 5-8", () => {
      const dob = new Date("2018-03-16");
      expect(calculateAgeGroup(dob)).toBe("5-8");
    });
  });
});

// ============================================================
// calculateAge
// ============================================================

describe("calculateAge", () => {
  const FIXED_TODAY = new Date("2026-03-15T10:00:00");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates age correctly for a past birthday this year", () => {
    // Born 2020-01-10 → turned 6 already this year
    const dob = new Date("2020-01-10");
    expect(calculateAge(dob)).toBe(6);
  });

  it("calculates age correctly when birthday has not happened yet", () => {
    // Born 2020-06-01 → still 5
    const dob = new Date("2020-06-01");
    expect(calculateAge(dob)).toBe(5);
  });

  it("calculates age correctly on exact birthday", () => {
    // Born 2020-03-15 → turns 6 today
    const dob = new Date("2020-03-15");
    expect(calculateAge(dob)).toBe(6);
  });

  it("returns 0 for a baby born this year", () => {
    const dob = new Date("2026-02-01");
    expect(calculateAge(dob)).toBe(0);
  });

  it("handles same-day birth", () => {
    const dob = new Date("2026-03-15");
    expect(calculateAge(dob)).toBe(0);
  });
});
