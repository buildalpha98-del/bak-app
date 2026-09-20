import { describe, it, expect } from "vitest";
import { canOpenReportCard, daysUntilDue } from "../report-card-release";

describe("canOpenReportCard", () => {
  it("childcare centres have no sign-off", () => {
    expect(canOpenReportCard({ isSchool: false, isPrimary: false, release: null })).toBe(true);
  });
  it("the primary contact always can", () => {
    expect(canOpenReportCard({ isSchool: true, isPrimary: true, release: null })).toBe(true);
  });
  it("teachers and colleagues wait for the release", () => {
    expect(canOpenReportCard({ isSchool: true, isPrimary: false, release: null })).toBe(false);
    expect(canOpenReportCard({ isSchool: true, isPrimary: false, release: { due_date: "2026-09-25", released_at: null } })).toBe(false);
    expect(canOpenReportCard({ isSchool: true, isPrimary: false, release: { due_date: null, released_at: "2026-09-26T00:00:00Z" } })).toBe(true);
  });
});

describe("daysUntilDue", () => {
  it("counts calendar days from today, negative when overdue", () => {
    expect(daysUntilDue({ due_date: "2026-09-25", released_at: null }, "2026-09-20")).toBe(5);
    expect(daysUntilDue({ due_date: "2026-09-18", released_at: null }, "2026-09-20")).toBe(-2);
    expect(daysUntilDue({ due_date: "2026-09-20", released_at: null }, "2026-09-20")).toBe(0);
    expect(daysUntilDue(null, "2026-09-20")).toBeNull();
  });
});
