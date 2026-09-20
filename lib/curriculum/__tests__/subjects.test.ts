import { describe, it, expect } from "vitest";
import { FRAMEWORKS } from "../frameworks";
import { SUBJECTS, SUBJECT_KEYS, subjectOf, isSubjectKey, programSectionsFor } from "../subjects";

describe("subject registry", () => {
  it("every subject has strand options and section headings", () => {
    for (const key of SUBJECT_KEYS) {
      const s = SUBJECTS[key];
      expect(s.strandOptions.length).toBeGreaterThan(0);
      expect(s.programSections.tip).toBeTruthy();
    }
    expect(programSectionsFor("english").tip).toBe("Teaching tip");
    expect(programSectionsFor(null).tip).toBe("Coaching tip");
  });

  it("unknown or missing subjects fall back to PDHPE (pre-089 rows)", () => {
    expect(subjectOf(null).key).toBe("pdhpe");
    expect(subjectOf("history").key).toBe("pdhpe");
    expect(subjectOf("english").key).toBe("english");
    expect(isSubjectKey("mathematics")).toBe(true);
    expect(isSubjectKey("science")).toBe(false);
  });

  it("report-card headings follow the framework, not the subject alone", () => {
    expect(FRAMEWORKS.nsw.outcomesHeading(SUBJECTS.pdhpe)).toBe("NSW PDHPE Outcomes Addressed");
    expect(FRAMEWORKS.nsw.outcomesHeading(SUBJECTS.english)).toBe("NSW English Outcomes Addressed");
    expect(FRAMEWORKS.vic.outcomesHeading(SUBJECTS.pdhpe)).toBe(
      "Victorian Curriculum HPE Content Descriptions Addressed"
    );
  });
});
