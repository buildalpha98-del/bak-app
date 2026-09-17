import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getProgramsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
  // Every fixture date below is written relative to this instant. The
  // original file only *documented* the date — the real calendar then
  // walked the fixtures across the 60/90-day cut-offs and the suite
  // started failing three months after it was written. Pin the clock.
  vi.useFakeTimers({ now: new Date("2026-06-17T00:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================
// Test helpers
// ============================================================
//
// The action fans out three calls:
//   1. `programs` select all (id, created_at, content_json)
//   2. `programs` select head/count with .gte("created_at", Monday)
//   3. `sessions` select(program_id, date).not("program_id", "is", null)
//
// We track the call index per table so the fixture can return the
// right shape on each call.

interface PulseFixture {
  allPrograms?: Array<{
    id: string;
    created_at: string;
    content_json: Record<string, unknown> | null;
  }>;
  newProgramsCount?: number;
  sessions?: Array<{ program_id: string | null; date: string }>;
}

function installFixture(opts: PulseFixture) {
  const allPrograms = opts.allPrograms ?? [];
  const newProgramsCount = opts.newProgramsCount ?? 0;
  const sessions = opts.sessions ?? [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "programs") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => {
          // Plain select → all programmes payload.
          if (!opts2?.head) {
            return Promise.resolve({ data: allPrograms, error: null });
          }
          // head + count → new-this-week. Terminates on .gte().
          return {
            gte: () =>
              Promise.resolve({
                count: newProgramsCount,
                data: null,
                error: null,
              }),
          };
        },
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          not: () =>
            Promise.resolve({
              data: sessions,
              error: null,
            }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getProgramsStatusPulse", () => {
  it("returns clean zeros when nothing matches (shape check)", async () => {
    installFixture({
      allPrograms: [],
      newProgramsCount: 0,
      sessions: [],
    });
    const pulse = await getProgramsStatusPulse();
    expect(pulse).toEqual({
      programmesMissingSkillsCount: 0,
      programmesUnusedCount: 0,
      programmesNewThisWeekCount: 0,
      programmesStaleCount: 0,
    });
  });

  it("counts programmes with empty / missing skillDevelopment as missing-skills", async () => {
    installFixture({
      allPrograms: [
        {
          id: "p1",
          created_at: "2026-06-01T00:00:00Z",
          content_json: null,
        },
        {
          id: "p2",
          created_at: "2026-06-01T00:00:00Z",
          content_json: { title: "X", skillDevelopment: [] },
        },
        {
          id: "p3",
          created_at: "2026-06-01T00:00:00Z",
          content_json: {
            title: "Y",
            skillDevelopment: [{ name: "Drill", duration: 5 }],
          },
        },
      ],
    });
    const pulse = await getProgramsStatusPulse();
    expect(pulse.programmesMissingSkillsCount).toBe(2);
  });

  it("counts programmes with no sessions as unused", async () => {
    installFixture({
      allPrograms: [
        {
          id: "used",
          created_at: "2026-06-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
        {
          id: "unused-a",
          created_at: "2026-06-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
        {
          id: "unused-b",
          created_at: "2026-06-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
      ],
      sessions: [{ program_id: "used", date: "2026-06-10" }],
    });
    const pulse = await getProgramsStatusPulse();
    expect(pulse.programmesUnusedCount).toBe(2);
  });

  it("counts programmes created ≥ 60d ago whose last session is ≥ 90d old as stale", async () => {
    // Today's date is 2026-06-17 per the test environment. Anything
    // created before ~2026-04-18 is past the 60-day age cut-off, and
    // a last-used date before ~2026-03-19 is past the 90-day stale
    // cut-off.
    installFixture({
      allPrograms: [
        // Stale — old enough AND last used long ago.
        {
          id: "stale",
          created_at: "2025-12-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
        // Not stale — recent last-use.
        {
          id: "fresh-use",
          created_at: "2025-12-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
        // Not stale — young programme.
        {
          id: "young",
          created_at: "2026-06-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
        // Not stale (unused) — has no sessions at all.
        {
          id: "no-sessions",
          created_at: "2025-12-01T00:00:00Z",
          content_json: { skillDevelopment: [{ name: "Drill" }] },
        },
      ],
      sessions: [
        { program_id: "stale", date: "2025-12-15" },
        { program_id: "fresh-use", date: "2026-06-10" },
        { program_id: "young", date: "2026-06-10" },
      ],
    });
    const pulse = await getProgramsStatusPulse();
    expect(pulse.programmesStaleCount).toBe(1);
    // Sanity — the unused count counts the one programme with no
    // session row.
    expect(pulse.programmesUnusedCount).toBe(1);
  });

  it("passes the new-this-week head count through", async () => {
    installFixture({
      allPrograms: [],
      newProgramsCount: 3,
    });
    const pulse = await getProgramsStatusPulse();
    expect(pulse.programmesNewThisWeekCount).toBe(3);
  });

  it("swallows thrown errors and returns all zeros (role gate / hard fail)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getProgramsStatusPulse();
    expect(pulse).toEqual({
      programmesMissingSkillsCount: 0,
      programmesUnusedCount: 0,
      programmesNewThisWeekCount: 0,
      programmesStaleCount: 0,
    });
  });
});
