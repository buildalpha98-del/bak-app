import { describe, it, expect } from "vitest";
import { yearGroupToStage } from "@/lib/schools/year-groups";
import { stageSummaryFromClasses } from "@/lib/schools/stage-summary";

describe("yearGroupToStage", () => {
  it("maps the NSW stages", () => {
    expect(yearGroupToStage("K")).toBe("Early Stage 1");
    expect(yearGroupToStage("1")).toBe("Stage 1");
    expect(yearGroupToStage("2")).toBe("Stage 1");
    expect(yearGroupToStage("3")).toBe("Stage 2");
    expect(yearGroupToStage("4")).toBe("Stage 2");
    expect(yearGroupToStage("5")).toBe("Stage 3");
    expect(yearGroupToStage("6")).toBe("Stage 3");
  });

  it("composites take the older year's stage", () => {
    expect(yearGroupToStage("5/6")).toBe("Stage 3");
    expect(yearGroupToStage("2/3")).toBe("Stage 2");
    expect(yearGroupToStage("K/1")).toBe("Stage 1");
  });

  it("childcare age bands and junk return null", () => {
    expect(yearGroupToStage("3-5")).toBe(null);
    expect(yearGroupToStage("5-8")).toBe(null);
    expect(yearGroupToStage("")).toBe(null);
    expect(yearGroupToStage("??")).toBe(null);
  });
});

describe("stageSummaryFromClasses", () => {
  const cls = (
    year_group: string,
    student_count: number,
    attendance: number | null,
    mark: number | null,
    delta: number | null = null
  ) => ({
    year_group,
    student_count,
    attendance_percentage: attendance,
    avg_mark: mark,
    mark_delta: delta,
  });

  it("groups by stage in syllabus order and weights by student count", () => {
    const rows = stageSummaryFromClasses([
      cls("3", 10, 90, 4.0, 0.5),
      cls("4", 30, 80, 3.0, 0.1),
      cls("K", 5, 100, 5.0),
    ]);
    expect(rows.map((r) => r.stage)).toEqual(["Early Stage 1", "Stage 2"]);
    const stage2 = rows[1];
    expect(stage2.student_count).toBe(40);
    // Weighted: (90*10 + 80*30) / 40 = 82.5 → 83
    expect(stage2.attendance_percentage).toBe(83);
    // (4*10 + 3*30) / 40 = 3.25 → 3.3
    expect(stage2.avg_mark).toBe(3.3);
    expect(stage2.mark_delta).toBe(0.2);
  });

  it("skips null metrics rather than counting them as zero", () => {
    const rows = stageSummaryFromClasses([
      cls("1", 10, null, 4.0),
      cls("2", 10, 90, null),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].attendance_percentage).toBe(90);
    expect(rows[0].avg_mark).toBe(4.0);
    expect(rows[0].mark_delta).toBe(null);
  });

  it("returns [] for childcare rooms (age-band year groups)", () => {
    expect(stageSummaryFromClasses([cls("3-5", 12, 90, 4)])).toEqual([]);
    expect(stageSummaryFromClasses(undefined)).toEqual([]);
  });
});
