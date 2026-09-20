import { describe, it, expect } from "vitest";
import { buildGridRows, countAssessed, gridAuthor } from "../assessment-grid";

const ME = "cu-me";
const students = [
  { id: "a", first_name: "Amira", last_name: "A" },
  { id: "b", first_name: "Bilal", last_name: "B" },
  { id: "c", first_name: "Chloe", last_name: "C" },
  { id: "d", first_name: "Dan", last_name: "D" },
];
const ratings = [
  { child_id: "a", coach_id: "coach-1", client_user_id: null, ratings_json: [{ skill_name: "Dribbling", rating: 4 }], notes: null },
  { child_id: "b", coach_id: null, client_user_id: ME, ratings_json: [{ skill_name: "Dribbling", rating: 3 }], notes: "Keen" },
  { child_id: "c", coach_id: null, client_user_id: "cu-other", ratings_json: [], notes: null },
];

describe("gridAuthor", () => {
  it("classifies coach, me, colleague and empty", () => {
    expect(gridAuthor(ratings[0], ME)).toBe("coach");
    expect(gridAuthor(ratings[1], ME)).toBe("me");
    expect(gridAuthor(ratings[2], ME)).toBe("colleague");
    expect(gridAuthor(undefined, ME)).toBeNull();
  });
});

describe("buildGridRows", () => {
  const rows = buildGridRows(students, ratings, ME);

  it("keeps student order and maps marks by skill", () => {
    expect(rows.map((r) => r.child.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows[0].marks).toEqual({ Dribbling: 4 });
    expect(rows[1].notes).toBe("Keen");
  });

  it("only empty rows and the viewer's own rows are editable", () => {
    expect(rows.map((r) => r.editable)).toEqual([false, true, false, true]);
  });

  it("counts assessed students regardless of author", () => {
    expect(countAssessed(rows)).toBe(3);
  });
});
