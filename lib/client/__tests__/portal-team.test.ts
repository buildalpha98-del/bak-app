import { describe, it, expect } from "vitest";
import { describeTeamRole, validClassIds } from "../portal-team";

const classes = [
  { id: "kb", name: "KB", year_group: "K", teacher_name: "Ms Bell" },
  { id: "2r", name: "2R", year_group: "2", teacher_name: "Mr Reid" },
  { id: "4t", name: "4T", year_group: "4", teacher_name: "Mrs Tan" },
];

describe("describeTeamRole", () => {
  it("names each role with its class scope", () => {
    expect(describeTeamRole({ role: "primary", is_primary: true, class_ids: [] }, classes)).toBe("Primary");
    expect(describeTeamRole({ role: "primary", is_primary: false, class_ids: [] }, classes)).toBe("Colleague");
    expect(describeTeamRole({ role: "teacher", is_primary: false, class_ids: ["2r", "4t"] }, classes)).toBe("Teacher · 2R, 4T");
    expect(describeTeamRole({ role: "teacher", is_primary: false, class_ids: [] }, classes)).toBe("Teacher · all classes");
  });

  it("ignores class ids that no longer exist", () => {
    expect(describeTeamRole({ role: "teacher", is_primary: false, class_ids: ["gone"] }, classes)).toBe("Teacher · all classes");
  });
});

describe("validClassIds", () => {
  it("keeps only this centre's classes, deduped", () => {
    expect(validClassIds(["2r", "2r", "other", "kb"], classes)).toEqual(["2r", "kb"]);
  });
});
