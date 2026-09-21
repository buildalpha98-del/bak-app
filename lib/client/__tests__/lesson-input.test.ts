import { describe, it, expect } from "vitest";
import { validateLessonInput } from "../lesson-input";

const good = {
  subject: "mathematics",
  focus: "Number and algebra",
  ageBand: "5-8",
  durationMinutes: 45,
  learningFocus: "bridging to ten",
  resources: ["Ten frames", "Counters", "Ten frames"],
  classId: "cls-2r",
};

describe("validateLessonInput", () => {
  it("accepts a well-formed request and dedupes resources", () => {
    const r = validateLessonInput(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.subject.key).toBe("mathematics");
      expect(r.value.resources).toEqual(["Ten frames", "Counters"]);
      expect(r.value.classId).toBe("cls-2r");
    }
  });

  it("accepts a PDHPE health lesson, but never a sport — coaching sessions are not portal lessons", () => {
    const health = validateLessonInput({
      ...good,
      subject: "pdhpe",
      focus: "Online safety",
      resources: ["Scenario cards", "Counters"],
    });
    expect(health.ok).toBe(true);
    if (health.ok) {
      expect(health.value.subject.key).toBe("pdhpe");
      expect(health.value.subject.programSections.session).toBe("lesson");
      expect(health.value.resources).toEqual(["Scenario cards"]);
    }
    expect(validateLessonInput({ ...good, subject: "pdhpe", focus: "Soccer", resources: ["Scenario cards"] }).ok).toBe(false);
    expect(validateLessonInput({ ...good, subject: "science" }).ok).toBe(false);
  });

  it("refuses a focus area from the wrong subject", () => {
    expect(validateLessonInput({ ...good, focus: "Reading comprehension" }).ok).toBe(false);
  });

  it("drops resources that are not on the subject's list and refuses when none remain", () => {
    const r = validateLessonInput({ ...good, resources: ["Cones", "Balls"] });
    expect(r.ok).toBe(false);
  });

  it("validates band and duration", () => {
    expect(validateLessonInput({ ...good, ageBand: "13-15" }).ok).toBe(false);
    expect(validateLessonInput({ ...good, durationMinutes: 50 }).ok).toBe(false);
  });

  it("caps the learning focus and treats blank as absent", () => {
    const r = validateLessonInput({ ...good, learningFocus: "x".repeat(300) });
    if (r.ok) expect(r.value.learningFocus?.length).toBe(200);
    const b = validateLessonInput({ ...good, learningFocus: "   " });
    if (b.ok) expect(b.value.learningFocus).toBeUndefined();
  });
});
