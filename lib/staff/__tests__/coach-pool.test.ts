import { describe, it, expect } from "vitest";
import { COACH_POOL_FILTER, isInCoachPool, isOpsCoach, navRoleFor } from "../coach-pool";

describe("coach pool", () => {
  it("counts coaches and ops-who-coach, nobody else", () => {
    expect(isInCoachPool({ role: "coach" })).toBe(true);
    expect(isInCoachPool({ role: "ops", also_coaches: true })).toBe(true);
    expect(isInCoachPool({ role: "ops", also_coaches: false })).toBe(false);
    expect(isInCoachPool({ role: "ops" })).toBe(false);
    // The flag means nothing for an admin — admins were never rostered.
    expect(isInCoachPool({ role: "admin", also_coaches: true })).toBe(false);
    expect(isInCoachPool(null)).toBe(false);
  });

  it("only an ops member with the flag is an ops coach", () => {
    expect(isOpsCoach({ role: "ops", also_coaches: true })).toBe(true);
    expect(isOpsCoach({ role: "coach", also_coaches: true })).toBe(false);
    expect(isOpsCoach({ role: "ops", also_coaches: false })).toBe(false);
  });

  it("an ops coach sees the coach nav on /coach pages only", () => {
    const carla = { role: "ops", also_coaches: true };
    expect(navRoleFor(carla, "/coach")).toBe("coach");
    expect(navRoleFor(carla, "/coach/schedule")).toBe("coach");
    expect(navRoleFor(carla, "/ops/roster")).toBe("ops");
    expect(navRoleFor(carla, "/coaching-tips")).toBe("ops");
    expect(navRoleFor({ role: "ops", also_coaches: false }, "/coach")).toBe("ops");
    expect(navRoleFor({ role: "admin" }, "/coach")).toBe("admin");
  });

  it("the PostgREST filter names both halves of the pool", () => {
    expect(COACH_POOL_FILTER).toBe("role.eq.coach,and(role.eq.ops,also_coaches.eq.true)");
  });
});
