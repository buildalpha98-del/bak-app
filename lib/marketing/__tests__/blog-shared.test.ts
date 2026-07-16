import { describe, it, expect } from "vitest";
import { formatPostDate } from "../blog-shared";

describe("formatPostDate", () => {
  it("formats a published instant as an en-AU long date", () => {
    expect(formatPostDate("2024-08-06T10:41:34Z")).toBe("6 August 2024");
  });

  it("projects into Sydney, not the server's timezone", () => {
    // 15:00 UTC is already the next calendar day in Sydney (UTC+10).
    // Vercel runs in bom1 (UTC+5:30), where this is still the 6th — so
    // a server-local format would show a different day to the reader
    // this site is written for. Sydney is the answer for everyone.
    expect(formatPostDate("2024-08-06T15:00:00Z")).toBe("7 August 2024");
  });

  it("handles the AEST/AEDT switch (UTC+11 in January)", () => {
    // Daylight saving: 13:30 UTC on 14 Jan is 00:30 on the 15th in
    // Sydney. A hardcoded +10 offset would get this wrong.
    expect(formatPostDate("2025-01-14T13:30:00Z")).toBe("15 January 2025");
  });
});
