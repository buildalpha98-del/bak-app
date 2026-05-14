import { describe, it, expect } from "vitest";
import {
  generateDefaultAvailabilitySlots,
  DEFAULT_AVAILABILITY_WINDOW,
} from "../default-availability";

describe("DEFAULT_AVAILABILITY_WINDOW", () => {
  it("is Mon-Fri 8:00am-4:30pm", () => {
    expect(DEFAULT_AVAILABILITY_WINDOW).toEqual({
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "08:00:00",
      endTime: "16:30:00",
    });
  });
});

describe("generateDefaultAvailabilitySlots", () => {
  const USER_ID = "user-1";

  it("returns exactly 5 rows, one per weekday", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    expect(slots).toHaveLength(5);
  });

  it("assigns each row to the given user_id", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    for (const slot of slots) {
      expect(slot.user_id).toBe(USER_ID);
    }
  });

  it("covers Monday (1) through Friday (5) with no duplicates and no weekend", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    const days = slots.map((s) => s.day_of_week).sort();
    expect(days).toEqual([1, 2, 3, 4, 5]);
  });

  it("sets the same 08:00:00-16:30:00 window on every row", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    for (const slot of slots) {
      expect(slot.start_time).toBe("08:00:00");
      expect(slot.end_time).toBe("16:30:00");
    }
  });

  it("returns empty location_preferences (admin can add later)", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    for (const slot of slots) {
      expect(slot.location_preferences).toEqual([]);
    }
  });
});
