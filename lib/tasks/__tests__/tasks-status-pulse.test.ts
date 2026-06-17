import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getTasksStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — per-table mock routing
// ============================================================
//
// The action fans out two distinct shapes:
//   1. `task_columns` — `.select("id").eq("is_final", true)` resolves
//      to the list of final-column rows used to exclude completed
//      tasks from every count.
//   2. `tasks` — four head-count queries, distinguished by which
//      filter is chained. We route by the chained method shape:
//      `.lt("due_date", ...)` (overdue), `.eq("due_date", ...)`
//      (due today), `.eq("assignee_id", ...)` (mine),
//      `.is("assignee_id", null)` (unassigned).
//
// Each query optionally ends with `.not("column_id", "in", ...)` —
// we just make the chain handle either case so the helpers stay
// thin and the cases stay readable.

interface PulseFixture {
  overdue?: number;
  dueToday?: number;
  mine?: number;
  unassigned?: number;
  finalCols?: Array<{ id: string }>;
}

function authedUser(userId: string | null) {
  if (userId === null) {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    return;
  }
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: userId } },
  });
}

function installFixture(opts: PulseFixture) {
  const overdue = opts.overdue ?? 0;
  const dueToday = opts.dueToday ?? 0;
  const mine = opts.mine ?? 0;
  const unassigned = opts.unassigned ?? 0;
  const finalCols = opts.finalCols ?? [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "task_columns") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ data: finalCols, error: null }),
        }),
      };
    }
    if (table === "tasks") {
      // All four count queries follow the same shape:
      //   .select("id", { count, head }).<filter>().not()?
      // We resolve `.not()` if it gets chained, otherwise resolve
      // straight from the filter. To make this work cleanly, every
      // terminal chainable returns a thenable that ALSO exposes
      // `.not()` returning the same thenable. We use Object.assign
      // to merge a Promise with a `.not()` method.
      const thenable = (value: number) => {
        const p: PromiseLike<unknown> & { not?: () => unknown } = {
          then: ((
            onFulfilled?:
              | ((value: unknown) => unknown)
              | null,
          ) =>
            Promise.resolve({
              count: value,
              data: null,
              error: null,
            }).then(onFulfilled)) as PromiseLike<unknown>["then"],
        };
        p.not = () => thenable(value);
        return p;
      };

      return {
        select: () => ({
          lt: () => thenable(overdue),
          eq: (col: string) => {
            if (col === "due_date") return thenable(dueToday);
            // assignee_id eq → "mine"
            return thenable(mine);
          },
          is: () => thenable(unassigned),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getTasksStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    authedUser("user-1");
    installFixture({});
    const pulse = await getTasksStatusPulse();
    expect(pulse).toEqual({
      overdueCount: 0,
      dueTodayCount: 0,
      mineCount: 0,
      unassignedCount: 0,
    });
  });

  it("passes the overdue head count through", async () => {
    authedUser("user-1");
    installFixture({ overdue: 12 });
    const pulse = await getTasksStatusPulse();
    expect(pulse.overdueCount).toBe(12);
  });

  it("passes the due-today head count through", async () => {
    authedUser("user-1");
    installFixture({ dueToday: 4 });
    const pulse = await getTasksStatusPulse();
    expect(pulse.dueTodayCount).toBe(4);
  });

  it("counts mine + unassigned and excludes final columns via the not-in clause", async () => {
    authedUser("user-1");
    installFixture({
      mine: 7,
      unassigned: 3,
      finalCols: [{ id: "done-col" }, { id: "archived-col" }],
    });
    const pulse = await getTasksStatusPulse();
    expect(pulse.mineCount).toBe(7);
    expect(pulse.unassignedCount).toBe(3);
  });

  it("returns zeros when no auth user is present (defensive)", async () => {
    authedUser(null);
    // No fixture install needed — the auth check returns before any
    // .from() call. Bare assertion that we don't fan out either.
    const pulse = await getTasksStatusPulse();
    expect(pulse).toEqual({
      overdueCount: 0,
      dueTodayCount: 0,
      mineCount: 0,
      unassignedCount: 0,
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    authedUser("user-1");
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getTasksStatusPulse();
    expect(pulse).toEqual({
      overdueCount: 0,
      dueTodayCount: 0,
      mineCount: 0,
      unassignedCount: 0,
    });
  });
});
