import { describe, it, expect } from "vitest";
import {
  parseClassListCsv,
  buildClassImportPlan,
  normaliseYearGroup,
  type RosterChildLite,
  type ExistingClassLite,
} from "@/lib/schools/class-import";

describe("normaliseYearGroup", () => {
  it("normalises kindergarten spellings to K", () => {
    expect(normaliseYearGroup("K")).toBe("K");
    expect(normaliseYearGroup("k")).toBe("K");
    expect(normaliseYearGroup("Kindy")).toBe("K");
    expect(normaliseYearGroup("Kindergarten")).toBe("K");
  });

  it("strips Year/Yr/Grade prefixes", () => {
    expect(normaliseYearGroup("Year 3")).toBe("3");
    expect(normaliseYearGroup("Yr 5")).toBe("5");
    expect(normaliseYearGroup("Grade 1")).toBe("1");
    expect(normaliseYearGroup("6")).toBe("6");
  });

  it("normalises composite separators to a slash", () => {
    expect(normaliseYearGroup("5/6")).toBe("5/6");
    expect(normaliseYearGroup("5-6")).toBe("5/6");
    expect(normaliseYearGroup("Year 5/6")).toBe("5/6");
    expect(normaliseYearGroup("K/1")).toBe("K/1");
  });

  it("returns null for unparseable input", () => {
    expect(normaliseYearGroup("")).toBeNull();
    expect(normaliseYearGroup("Staff")).toBeNull();
  });
});

describe("parseClassListCsv", () => {
  it("parses the documented four-column shape", () => {
    const csv = [
      "Student name,Year,Class,Teacher",
      "Ava Nguyen,3,3B,Ms Chen",
      "Noah Smith,K,KM,Mr Patel",
    ].join("\n");
    const result = parseClassListCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      firstName: "Ava",
      lastName: "Nguyen",
      className: "3B",
      yearGroup: "3",
      teacherName: "Ms Chen",
    });
    expect(result.rows[1].yearGroup).toBe("K");
  });

  it("accepts separate first/last name columns and no teacher", () => {
    const csv = [
      "First name,Last name,Class,Year group",
      "Ava,Nguyen,5/6M,5/6",
    ].join("\n");
    const result = parseClassListCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      firstName: "Ava",
      lastName: "Nguyen",
      className: "5/6M",
      yearGroup: "5/6",
      teacherName: null,
    });
  });

  it("derives the year group from the class name when no year column exists", () => {
    const csv = ["Name,Class", "Ava Nguyen,3B", "Noah Smith,KM", "Mia Jones,5/6M"].join("\n");
    const result = parseClassListCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.yearGroup)).toEqual(["3", "K", "5/6"]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = ['Name,Year,Class,Teacher', '"Nguyen, Ava",3,3B,"Chen, Sarah"'].join("\n");
    const result = parseClassListCsv(csv);
    expect(result.errors).toEqual([]);
    // "Last, First" order inside one quoted field is flipped.
    expect(result.rows[0]).toMatchObject({ firstName: "Ava", lastName: "Nguyen" });
    expect(result.rows[0].teacherName).toBe("Chen, Sarah");
  });

  it("reports rows missing a student name or class with 1-based data line numbers", () => {
    const csv = ["Name,Year,Class", ",3,3B", "Noah Smith,3,"].join("\n");
    const result = parseClassListCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].line).toBe(1);
    expect(result.errors[1].line).toBe(2);
  });

  it("rejects a file without a recognisable header", () => {
    const result = parseClassListCsv("foo,bar\n1,2");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/header/i);
  });

  it("skips blank lines and trims a BOM", () => {
    const csv = "﻿Name,Class\n\nAva Nguyen,3B\n\n";
    const result = parseClassListCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });
});

describe("buildClassImportPlan", () => {
  const roster: RosterChildLite[] = [
    { child_id: "c1", first_name: "Ava", last_name: "Nguyen" },
    { child_id: "c2", first_name: "Noah", last_name: "Smith" },
    { child_id: "c3", first_name: "Mia", last_name: "Jones" },
    { child_id: "c4", first_name: "Mia", last_name: "Johnson" },
  ];
  const existing: ExistingClassLite[] = [
    { id: "cls-3b", name: "3B", year_group: "3", teacher_name: null },
  ];

  const parse = (lines: string[]) => {
    const parsed = parseClassListCsv(["Name,Year,Class,Teacher", ...lines].join("\n"));
    expect(parsed.errors).toEqual([]);
    return parsed.rows;
  };

  it("matches children case-insensitively and groups by class", () => {
    const rows = parse(["ava nguyen,3,3B,Ms Chen", "NOAH SMITH,K,KM,Mr Patel"]);
    const plan = buildClassImportPlan(rows, roster, existing);
    expect(plan.unmatched).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
    expect(plan.assignments).toEqual([
      { child_id: "c1", className: "3B" },
      { child_id: "c2", className: "KM" },
    ]);
    // 3B exists (gains teacher), KM is new.
    const km = plan.classes.find((c) => c.name === "KM");
    expect(km).toMatchObject({ existing_id: null, year_group: "K", teacher_name: "Mr Patel" });
    const b3 = plan.classes.find((c) => c.name === "3B");
    expect(b3).toMatchObject({ existing_id: "cls-3b", teacher_name: "Ms Chen" });
  });

  it("flags children not on the roster as unmatched", () => {
    const rows = parse(["Zara Unknown,3,3B,"]);
    const plan = buildClassImportPlan(rows, roster, existing);
    expect(plan.assignments).toEqual([]);
    expect(plan.unmatched).toHaveLength(1);
    expect(plan.unmatched[0].studentName).toBe("Zara Unknown");
  });

  it("flags duplicate names on the roster as ambiguous rather than guessing", () => {
    // Two Mias with different surnames are fine; make the row itself ambiguous.
    const twoMias: RosterChildLite[] = [
      { child_id: "c3", first_name: "Mia", last_name: "Jones" },
      { child_id: "c5", first_name: "Mia", last_name: "Jones" },
    ];
    const rows = parse(["Mia Jones,3,3B,"]);
    const plan = buildClassImportPlan(rows, twoMias, existing);
    expect(plan.assignments).toEqual([]);
    expect(plan.ambiguous).toHaveLength(1);
    expect(plan.ambiguous[0].candidates.map((c) => c.child_id)).toEqual(["c3", "c5"]);
  });

  it("keeps the first non-empty teacher and flags conflicting teachers", () => {
    const rows = parse(["Ava Nguyen,3,3B,Ms Chen", "Noah Smith,3,3B,Mr Wrong"]);
    const plan = buildClassImportPlan(rows, roster, existing);
    const b3 = plan.classes.find((c) => c.name === "3B");
    expect(b3?.teacher_name).toBe("Ms Chen");
    expect(plan.warnings.some((w) => /teacher/i.test(w))).toBe(true);
  });

  it("flags one class name appearing with two different year groups", () => {
    const rows = parse(["Ava Nguyen,3,3B,", "Noah Smith,4,3B,"]);
    const plan = buildClassImportPlan(rows, roster, existing);
    expect(plan.warnings.some((w) => /year/i.test(w))).toBe(true);
    const b3 = plan.classes.find((c) => c.name === "3B");
    expect(b3?.year_group).toBe("3");
  });
});
