import { describe, expect, it } from "vitest";
import { parseHoursAdjustmentTask, reviewCause } from "../decision-queue";

describe("parseHoursAdjustmentTask", () => {
  const task = {
    id: "t1",
    title: "Hours adjustment: Abz — Soccer 2026-09-10",
    description: ["Coach: Abz", "Session: Soccer at Al Bayan Liverpool on 2026-09-10", "Rostered: 60 min", "Requested: 90 min", "Reason: Ran into lunch", "Session ID: s1"].join("\n"),
    linked_entity_id: "s1",
    created_at: "2026-09-10T05:00:00Z",
  };

  it("reads the coach's request back out of the task the app wrote", () => {
    expect(parseHoursAdjustmentTask(task)).toEqual({
      task_id: "t1",
      session_id: "s1",
      coach_name: "Abz",
      rostered_minutes: 60,
      requested_minutes: 90,
      reason: "Ran into lunch",
      since: "2026-09-10T05:00:00Z",
    });
  });

  it("falls back to the Session ID line and ignores tasks that are not requests", () => {
    expect(parseHoursAdjustmentTask({ ...task, linked_entity_id: null })!.session_id).toBe("s1");
    expect(parseHoursAdjustmentTask({ ...task, title: "Fix the goals at Bankstown" })).toBeNull();
    expect(parseHoursAdjustmentTask({ ...task, description: "Requested: soon" })).toBeNull();
  });
});

describe("reviewCause", () => {
  it("tells a long session from one nobody checked out of", () => {
    expect(reviewCause({ actual_duration_minutes: 90, duration_minutes: 60 })).toBe("ran_long");
    expect(reviewCause({ actual_duration_minutes: null, duration_minutes: 60 })).toBe("auto_closed");
    expect(reviewCause({ actual_duration_minutes: 60, duration_minutes: 60 })).toBe("auto_closed");
  });
});
