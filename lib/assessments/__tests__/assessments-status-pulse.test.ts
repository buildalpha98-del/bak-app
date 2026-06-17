import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getAssessmentsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — per-table fan-out via mockImplementation
// ============================================================
//
// The action makes three distinct `skill_ratings` calls. We track them
// by call index so each one can return a tailored dataset:
//   call #1: termRatings — eq("term_id").in("assessment_template_id")
//   call #2: ratings-by-coach all-time — select().in("coach_id")
//   call #3: ratings-by-coach this-week — select().in("coach_id").gte()
//
// Promise.all may interleave (2) and (3) — we use a small "thenable"
// shim so the all-time call (no .gte) and this-week call (with .gte)
// each terminate cleanly with the right dataset.

interface PulseFixture {
  allTemplates?: Array<{
    id: string;
    age_group: string;
    centre_id: string | null;
    skills_json: unknown;
    term_id: string | null;
  }>;
  newTemplatesCount?: number;
  activeTerm?: { id: string } | null;
  activeCoaches?: Array<{ id: string }>;
  activeChildren?: Array<{ id: string; age_group: string }>;
  centreChildLinks?: Array<{ child_id: string; centre_id: string }>;
  termRatings?: Array<{
    assessment_template_id: string;
    child_id: string;
  }>;
  ratingsByCoachAllTime?: Array<{ coach_id: string }>;
  ratingsByCoachThisWeek?: Array<{ coach_id: string }>;
}

function installFixture(opts: PulseFixture) {
  const allTemplates = opts.allTemplates ?? [];
  const newTemplatesCount = opts.newTemplatesCount ?? 0;
  const activeTerm = opts.activeTerm === undefined ? null : opts.activeTerm;
  const activeCoaches = opts.activeCoaches ?? [];
  const activeChildren = opts.activeChildren ?? [];
  const centreChildLinks = opts.centreChildLinks ?? [];
  const termRatings = opts.termRatings ?? [];
  const ratingsByCoachAllTime = opts.ratingsByCoachAllTime ?? [];
  const ratingsByCoachThisWeek = opts.ratingsByCoachThisWeek ?? [];

  let skillRatingsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "assessment_templates") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => {
          if (opts2?.head) {
            return {
              gte: () =>
                Promise.resolve({
                  count: newTemplatesCount,
                  data: null,
                  error: null,
                }),
            };
          }
          // Plain select() — awaitable directly.
          return Promise.resolve({
            data: allTemplates,
            error: null,
          });
        },
      };
    }
    if (table === "terms") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: activeTerm ? [activeTerm] : [],
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: activeCoaches,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "children") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: activeChildren,
              error: null,
            }),
        }),
      };
    }
    if (table === "centre_children") {
      return {
        select: () => ({
          in: () => ({
            eq: () =>
              Promise.resolve({
                data: centreChildLinks,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "skill_ratings") {
      skillRatingsCall += 1;
      // Call #1: term ratings → eq().in()
      if (skillRatingsCall === 1) {
        return {
          select: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: termRatings,
                  error: null,
                }),
            }),
          }),
        };
      }
      // Calls #2 + #3: coaches all-time + this-week. Both start with
      // .select("coach_id").in("coach_id", ids). The all-time call
      // awaits the .in() result directly; the this-week call chains
      // .gte().
      //
      // We return a thenable from .in() so the direct-await path
      // resolves to all-time, and a .gte path resolves to this-week.
      const isAllTimeCall = skillRatingsCall === 2;
      return {
        select: () => ({
          in: () => {
            const result = {
              data: isAllTimeCall
                ? ratingsByCoachAllTime
                : ratingsByCoachThisWeek,
              error: null,
            };
            return {
              // Make this awaitable: yields the all-time data.
              then: (
                resolve: (val: typeof result) => unknown,
                _reject?: unknown,
              ) => resolve(result),
              // .gte() variant — only the this-week call hits this.
              gte: () =>
                Promise.resolve({
                  data: ratingsByCoachThisWeek,
                  error: null,
                }),
            };
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getAssessmentsStatusPulse", () => {
  it("returns clean zeros when nothing matches (shape check)", async () => {
    installFixture({
      allTemplates: [],
      newTemplatesCount: 0,
      activeTerm: null,
      activeCoaches: [],
      activeChildren: [],
    });

    const pulse = await getAssessmentsStatusPulse();
    expect(pulse).toEqual({
      templatesWithoutSkillsCount: 0,
      childrenPendingCount: 0,
      coachesUnsubmittedCount: 0,
      newTemplatesThisWeekCount: 0,
    });
  });

  it("counts templates with empty skills_json as without-skills", async () => {
    installFixture({
      allTemplates: [
        {
          id: "t1",
          age_group: "5-8",
          centre_id: null,
          skills_json: [],
          term_id: null,
        },
        {
          id: "t2",
          age_group: "5-8",
          centre_id: null,
          skills_json: [{ name: "x", description: "" }],
          term_id: null,
        },
        {
          id: "t3",
          age_group: "8-12",
          centre_id: null,
          skills_json: [],
          term_id: null,
        },
      ],
      activeTerm: null,
    });

    const pulse = await getAssessmentsStatusPulse();
    expect(pulse.templatesWithoutSkillsCount).toBe(2);
  });

  it("reports zero pending when there is no active term (term-filter)", async () => {
    installFixture({
      allTemplates: [
        {
          id: "t1",
          age_group: "5-8",
          centre_id: null,
          skills_json: [{ name: "x", description: "" }],
          term_id: "t-old",
        },
      ],
      activeTerm: null,
      activeChildren: [{ id: "c1", age_group: "5-8" }],
    });

    const pulse = await getAssessmentsStatusPulse();
    expect(pulse.childrenPendingCount).toBe(0);
  });

  it("scopes pending count to (template, child) pairs in the active term (scope)", async () => {
    installFixture({
      allTemplates: [
        // In active term, age 5-8, org-wide → eligible children: c1, c2
        {
          id: "tA",
          age_group: "5-8",
          centre_id: null,
          skills_json: [{ name: "x", description: "" }],
          term_id: "t1",
        },
        // Older term — not in scope
        {
          id: "tOld",
          age_group: "5-8",
          centre_id: null,
          skills_json: [{ name: "y", description: "" }],
          term_id: "t-old",
        },
      ],
      activeTerm: { id: "t1" },
      activeChildren: [
        { id: "c1", age_group: "5-8" },
        { id: "c2", age_group: "5-8" },
        { id: "c3", age_group: "8-12" },
      ],
      // c1 already rated against tA in active term → c2 is the only
      // pending pair (c3 has wrong age group).
      termRatings: [
        { assessment_template_id: "tA", child_id: "c1" },
      ],
    });

    const pulse = await getAssessmentsStatusPulse();
    expect(pulse.childrenPendingCount).toBe(1);
  });

  it("passes the new-templates-this-week head count through", async () => {
    installFixture({
      allTemplates: [],
      newTemplatesCount: 4,
      activeTerm: null,
    });
    const pulse = await getAssessmentsStatusPulse();
    expect(pulse.newTemplatesThisWeekCount).toBe(4);
  });

  it("swallows thrown errors and returns all zeros (role gate / hard fail)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getAssessmentsStatusPulse();
    expect(pulse).toEqual({
      templatesWithoutSkillsCount: 0,
      childrenPendingCount: 0,
      coachesUnsubmittedCount: 0,
      newTemplatesThisWeekCount: 0,
    });
  });
});
