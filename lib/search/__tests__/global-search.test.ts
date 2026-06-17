import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ============================================================
// Hoisted Supabase mock — per-table fixture routing
// ============================================================

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { globalSearch } from "../actions";

// ============================================================
// Per-table fixture factory
// ============================================================
//
// globalSearch fans out:
//   1. profiles (only when scope is admin/ops)  — staff search
//   2. centres                                   — only when admin/ops
//   3. leads                                     — only when admin/ops
//   4. children                                  — always
//   5. sessions  (with centres!inner join)       — always
//   6. programs                                  — always
//   7. documents                                 — always
//
// Plus an optional 8th `profiles` call when roleScope is not provided,
// to resolve the viewer's role. We key our fixture by `(table, callIndex)`
// because both `profiles` and `sessions` may be touched twice.

interface Fixture {
  centres?: Array<Record<string, unknown>>;
  staff?: Array<Record<string, unknown>>;
  leads?: Array<Record<string, unknown>>;
  children?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  programs?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  /**
   * When the action looks up the caller's role via profiles.eq('id').maybeSingle()
   * (i.e. no roleScope passed), return this. Otherwise the role-lookup branch is
   * never hit because we always pass roleScope in these tests.
   */
  viewerRole?: string | null;
}

function installFixture(opts: Fixture) {
  const centres = opts.centres ?? [];
  const staff = opts.staff ?? [];
  const leads = opts.leads ?? [];
  const children = opts.children ?? [];
  const sessions = opts.sessions ?? [];
  const programs = opts.programs ?? [];
  const documents = opts.documents ?? [];

  // profiles is consulted at most twice: once optionally for role-lookup
  // (when roleScope is not passed), then once for the staff search.
  let profilesCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    switch (table) {
      case "profiles": {
        profilesCall += 1;
        // Branch: role-lookup uses .eq().maybeSingle().
        if (opts.viewerRole !== undefined && profilesCall === 1) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data:
                      opts.viewerRole === null
                        ? null
                        : { role: opts.viewerRole },
                    error: null,
                  }),
              }),
            }),
          };
        }
        // Staff search branch: .or().limit() resolves to a row list.
        return {
          select: () => ({
            or: () => ({
              limit: () =>
                Promise.resolve({ data: staff, error: null }),
            }),
          }),
        };
      }
      case "centres": {
        return {
          select: () => ({
            or: () => ({
              limit: () =>
                Promise.resolve({ data: centres, error: null }),
            }),
          }),
        };
      }
      case "leads": {
        return {
          select: () => ({
            or: () => ({
              limit: () =>
                Promise.resolve({ data: leads, error: null }),
            }),
          }),
        };
      }
      case "children": {
        return {
          select: () => ({
            or: () => ({
              limit: () =>
                Promise.resolve({ data: children, error: null }),
            }),
          }),
        };
      }
      case "sessions": {
        // Sessions: source does `select().limit()` then chains `.eq()`
        // (date) OR `.ilike()` (centre name), and may add `.eq("coach_id")`.
        // Each chained method returns the same thenable; awaiting the final
        // builder resolves to the fixture rows.
        const value = { data: sessions, error: null };
        type Thenable = {
          eq: (..._args: unknown[]) => Thenable;
          ilike: (..._args: unknown[]) => Thenable;
          then: (
            onFulfilled?: (v: unknown) => unknown,
            onRejected?: (r: unknown) => unknown
          ) => Promise<unknown>;
        };
        const make = (): Thenable => {
          const t: Thenable = {
            eq: () => t,
            ilike: () => t,
            then: (onFulfilled, onRejected) =>
              Promise.resolve(value).then(onFulfilled, onRejected),
          };
          return t;
        };
        return {
          select: () => ({
            limit: () => make(),
          }),
        };
      }
      case "programs": {
        return {
          select: () => ({
            or: () => ({
              limit: () =>
                Promise.resolve({ data: programs, error: null }),
            }),
          }),
        };
      }
      case "documents": {
        return {
          select: () => ({
            or: () => ({
              limit: () =>
                Promise.resolve({ data: documents, error: null }),
            }),
          }),
        };
      }
      default:
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockReset();
  supabaseMock.from.mockReset();
});

// ============================================================
// Tests
// ============================================================

describe("globalSearch", () => {
  // -------- 1. Auth gate ------------------------------------------
  it("returns empty when no authenticated user", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    installFixture({
      centres: [{ id: "c1", name: "Hit", address: null, contract_status: "active" }],
    });

    const results = await globalSearch("hit", { roleScope: "admin" });

    expect(results).toEqual([]);
    // Critical: even though we passed a scope, the auth gate fires first
    // and `from` should never be called.
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  // -------- 2. Role scoping (coach narrow slice) ------------------
  it("scopes coach to the narrow entity set (no staff / centres / leads)", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "coach-1" } },
      error: null,
    });
    installFixture({
      // These would leak if the coach branch wasn't enforced.
      centres: [
        { id: "c1", name: "Should not appear", address: null, contract_status: "active" },
      ],
      staff: [{ id: "s1", name: "Should not appear", email: "x@x.com" }],
      leads: [{ id: "l1", centre_name: "Should not appear" }],
      // Coaches DO see these:
      children: [
        {
          id: "ch1",
          first_name: "Alex",
          last_name: "Smith",
          date_of_birth: "2018-01-01",
        },
      ],
      sessions: [
        {
          id: "ses1",
          date: "2026-06-10",
          time: "08:00",
          sport: "Soccer",
          centre_id: "c1",
          centres: { name: "Centre One" },
        },
      ],
      programs: [
        {
          id: "p1",
          sport: "Soccer",
          skill_focus: "dribbling",
          age_group: "5-8",
          content_json: { title: "Soccer · dribbling" },
        },
      ],
      documents: [
        { id: "d1", title: "Coach handbook", file_name: "handbook.pdf" },
      ],
    });

    const results = await globalSearch("soccer", { roleScope: "coach" });

    const types = new Set(results.map((r) => r.type));
    expect(types.has("staff")).toBe(false);
    expect(types.has("centre")).toBe(false);
    expect(types.has("lead")).toBe(false);
    // Coach-permitted types should still appear when present.
    expect(types.has("session")).toBe(true);
    expect(types.has("program")).toBe(true);
    expect(types.has("document")).toBe(true);
  });

  // -------- 3. Entity fan-out (all 7 types) -----------------------
  it("returns up to 5 results per entity type for admin", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });

    const make = (prefix: string) =>
      Array.from({ length: 5 }, (_, i) => ({ id: `${prefix}-${i}` }));

    installFixture({
      centres: make("c").map((r, i) => ({
        ...r,
        name: `Centre ${i}`,
        address: "Sydney",
        contract_status: "active",
      })),
      staff: make("s").map((r, i) => ({
        ...r,
        name: `Coach ${i}`,
        email: `coach${i}@x.com`,
        role: "coach",
      })),
      leads: make("l").map((r, i) => ({
        ...r,
        centre_name: `Lead Centre ${i}`,
        contact_name: `Contact ${i}`,
        stage: "interested",
      })),
      children: make("ch").map((r, i) => ({
        ...r,
        first_name: `Kid${i}`,
        last_name: "Smith",
      })),
      sessions: make("ses").map((r, i) => ({
        ...r,
        date: "2026-06-10",
        time: "08:00",
        sport: "Soccer",
        centre_id: "c1",
        centres: { name: "Centre One" },
      })),
      programs: make("p").map((r, i) => ({
        ...r,
        sport: "Soccer",
        skill_focus: `focus ${i}`,
        age_group: "5-8",
        content_json: { title: `Program ${i}` },
      })),
      documents: make("d").map((r, i) => ({
        ...r,
        title: `Doc ${i}`,
        file_name: `doc${i}.pdf`,
      })),
    });

    // Default limit is 30; raise to 35 so all 7 × 5 results survive the cap.
    const results = await globalSearch("smith", {
      roleScope: "admin",
      limit: 50,
    });

    const grouped: Record<string, number> = {};
    for (const r of results) {
      grouped[r.type] = (grouped[r.type] ?? 0) + 1;
    }
    expect(grouped.centre).toBe(5);
    expect(grouped.staff).toBe(5);
    expect(grouped.lead).toBe(5);
    expect(grouped.child).toBe(5);
    expect(grouped.session).toBe(5);
    expect(grouped.program).toBe(5);
    expect(grouped.document).toBe(5);
  });

  // -------- 4. Query parsing — ISO date matches sessions -----------
  it("treats an ISO date as a session date lookup", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    installFixture({
      sessions: [
        {
          id: "ses-1",
          date: "2026-06-10",
          time: "09:00",
          sport: "Soccer",
          centre_id: "c1",
          centres: { name: "Centre One" },
        },
      ],
    });

    const results = await globalSearch("2026-06-10", { roleScope: "admin" });

    const session = results.find((r) => r.type === "session");
    expect(session).toBeDefined();
    expect(session?.url).toContain("week=2026-06-10");
  });

  // -------- 5. Empty query returns empty (no auth call) -----------
  it("returns empty for a too-short query without hitting the DB", async () => {
    const results = await globalSearch(" ", { roleScope: "admin" });
    expect(results).toEqual([]);
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  // -------- 6. Limit enforcement ----------------------------------
  it("caps total results at the requested limit", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    installFixture({
      centres: Array.from({ length: 5 }, (_, i) => ({
        id: `c-${i}`,
        name: `Centre ${i}`,
        address: "Sydney",
        contract_status: "active",
      })),
      staff: Array.from({ length: 5 }, (_, i) => ({
        id: `s-${i}`,
        name: `Staff ${i}`,
        email: `s${i}@x.com`,
        role: "coach",
      })),
      leads: Array.from({ length: 5 }, (_, i) => ({
        id: `l-${i}`,
        centre_name: `Lead ${i}`,
        contact_name: `Contact ${i}`,
      })),
      children: Array.from({ length: 5 }, (_, i) => ({
        id: `ch-${i}`,
        first_name: `Kid${i}`,
        last_name: "X",
      })),
    });

    const results = await globalSearch("ce", {
      roleScope: "admin",
      limit: 7,
    });

    expect(results).toHaveLength(7);
  });

  // -------- 7. Bonus: parent / client returns nothing -------------
  it("returns empty for parent role (non-searchable)", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "parent-1" } },
      error: null,
    });
    installFixture({
      centres: [
        { id: "c1", name: "Hit", address: null, contract_status: "active" },
      ],
    });

    const results = await globalSearch("hit", { roleScope: "parent" });

    expect(results).toEqual([]);
  });
});
