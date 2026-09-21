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

describe("PDHPE classroom (health) lessons", () => {
  it("no health focus area is also a sport — the strand alone decides", async () => {
    const { PDHPE_HEALTH_FOCUS, SUBJECTS } = await import("../subjects");
    for (const f of PDHPE_HEALTH_FOCUS) expect(SUBJECTS.pdhpe.strandOptions).not.toContain(f);
  });

  it("a PDHPE programme is a lesson only when its strand is a health focus", async () => {
    const { isClassroomLesson, programSectionsFor, lessonDefFor, isLessonDef } = await import("../subjects");
    expect(isClassroomLesson("pdhpe", "Soccer")).toBe(false);
    expect(isClassroomLesson(null, null)).toBe(false);
    expect(isClassroomLesson("pdhpe", "Online safety")).toBe(true);
    expect(isClassroomLesson("english", "Vocabulary")).toBe(true);
    expect(programSectionsFor("pdhpe", "Soccer").session).toBe("session");
    expect(programSectionsFor("pdhpe").warmUp).toBe("Warm-up");
    expect(programSectionsFor("pdhpe", "Online safety").warmUp).toBe("Hook / tuning in");
    const def = lessonDefFor("pdhpe", "Respectful relationships");
    expect(def.key).toBe("pdhpe");
    expect(isLessonDef(def)).toBe(true);
    expect(isLessonDef(lessonDefFor("pdhpe", "Netball"))).toBe(false);
  });

  it("carries the strand names term plans use, so Write lesson prefills", async () => {
    const { PDHPE_HEALTH_FOCUS } = await import("../subjects");
    expect(PDHPE_HEALTH_FOCUS).toContain("Personal development and health");
    expect(PDHPE_HEALTH_FOCUS).toContain("Personal, social and community health");
  });
});
