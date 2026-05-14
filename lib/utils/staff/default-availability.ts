/**
 * Default availability for new staff: Mon–Fri 8:00am–4:30pm.
 *
 * Stored as Postgres `time` (no timezone) — interpreted in the centre's
 * local timezone at read time. DST boundaries are not a concern because
 * the value is "8am local", not a UTC offset.
 *
 * Pure: no DB calls. The server-side `createStaffMember` calls this
 * helper and batch-inserts the rows after the profile row exists.
 *
 * Adapted from the P1 spec at:
 * docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
 */

export const DEFAULT_AVAILABILITY_WINDOW = {
  daysOfWeek: [1, 2, 3, 4, 5] as const,
  startTime: "08:00:00" as const,
  endTime: "16:30:00" as const,
};

export interface DefaultAvailabilitySlotInput {
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_preferences: string[];
}

export function generateDefaultAvailabilitySlots(
  userId: string,
): DefaultAvailabilitySlotInput[] {
  return DEFAULT_AVAILABILITY_WINDOW.daysOfWeek.map((dow) => ({
    user_id: userId,
    day_of_week: dow,
    start_time: DEFAULT_AVAILABILITY_WINDOW.startTime,
    end_time: DEFAULT_AVAILABILITY_WINDOW.endTime,
    location_preferences: [],
  }));
}
