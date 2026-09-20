import { describe, it, expect } from "vitest";
import { sessionsToAutocomplete } from "../autocomplete";

// 2026-09-20T13:30:00Z is 23:30 Sydney (AEST, UTC+10) on Sunday 20 Sep.
const NOW = new Date("2026-09-20T13:30:00Z");

const s = (id: string, date: string, status: string) => ({ id, date, status });

describe("sessionsToAutocomplete", () => {
  it("closes published sessions dated before Sydney's today", () => {
    const out = sessionsToAutocomplete(
      [
        s("a", "2026-09-19", "published"),
        s("b", "2026-09-17", "confirmed"),
        s("c", "2026-09-16", "pending_confirmation"),
        s("d", "2026-09-18", "in_progress"),
      ],
      NOW
    );
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves today's and future sessions alone", () => {
    const out = sessionsToAutocomplete(
      [s("today", "2026-09-20", "published"), s("next", "2026-09-23", "published")],
      NOW
    );
    expect(out).toEqual([]);
  });

  it("uses Sydney's date, not UTC's", () => {
    // 14:30Z on 20 Sep is already 00:30 on 21 Sep in Sydney: the 20th is past.
    const out = sessionsToAutocomplete(
      [s("x", "2026-09-20", "published")],
      new Date("2026-09-20T14:30:00Z")
    );
    expect(out.map((x) => x.id)).toEqual(["x"]);
  });

  it("never touches drafts, cancelled or completed sessions", () => {
    const out = sessionsToAutocomplete(
      [
        s("draft", "2026-09-01", "draft"),
        s("cancelled", "2026-09-01", "cancelled"),
        s("done", "2026-09-01", "completed"),
      ],
      NOW
    );
    expect(out).toEqual([]);
  });
});
