import { describe, it, expect } from "vitest";
import {
  SUBJECTS,
  SUBJECT_KEYS,
  subjectOf,
  subjectForCode,
  isSubjectKey,
  outcomesHeading,
} from "../subjects";

describe("subject registry", () => {
  it("every subject has a prefix for each NSW stage and a code family", () => {
    for (const key of SUBJECT_KEYS) {
      const s = SUBJECTS[key];
      expect(Object.keys(s.stagePrefixes).sort()).toEqual(
        ["Early Stage 1", "Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"].sort()
      );
      for (const p of Object.values(s.stagePrefixes)) expect(p.startsWith(s.codeFamily)).toBe(true);
      expect(s.strandOptions.length).toBeGreaterThan(0);
    }
  });

  it("unknown or missing subjects fall back to PDHPE (pre-089 rows)", () => {
    expect(subjectOf(null).key).toBe("pdhpe");
    expect(subjectOf("history").key).toBe("pdhpe");
    expect(subjectOf("english").key).toBe("english");
    expect(isSubjectKey("mathematics")).toBe(true);
    expect(isSubjectKey("science")).toBe(false);
  });

  it("routes outcome codes to their subject by family", () => {
    expect(subjectForCode("PD2-4")?.key).toBe("pdhpe");
    expect(subjectForCode("PDe-1")?.key).toBe("pdhpe");
    expect(subjectForCode("EN1-RECOM-01")?.key).toBe("english");
    expect(subjectForCode("MA2-RN-01")?.key).toBe("mathematics");
    expect(subjectForCode("EYLF 1.1")).toBeNull();
  });

  it("names the report-card heading per subject", () => {
    expect(outcomesHeading(SUBJECTS.pdhpe)).toBe("NSW PDHPE Outcomes Addressed");
    expect(outcomesHeading(SUBJECTS.english)).toBe("NSW English Outcomes Addressed");
  });
});
