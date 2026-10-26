import { it, expect, vi, afterEach } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("refuses to load calendar signing with no production secret", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CALENDAR_FEED_SECRET", "");
  vi.resetModules();
  await expect(import("@/lib/calendar/token")).rejects.toThrow("CALENDAR_FEED_SECRET is required");
});
it("signs and verifies with a configured production secret", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CALENDAR_FEED_SECRET", "test-only-calendar-key");
  vi.resetModules();
  const { generateCalendarToken, verifyCalendarToken } = await import("@/lib/calendar/token");
  const token = generateCalendarToken("coach", "00000000-0000-4000-8000-000000000001");
  expect(verifyCalendarToken("coach", token)).not.toBeNull();
});
