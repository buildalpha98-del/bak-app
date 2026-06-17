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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { bulkUpdateCampaignStatus } from "../campaign-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface HarnessOpts {
  role?: "admin" | "ops" | "coach";
  failOnIds?: Set<string>;
}

function installHarness(opts: HarnessOpts = {}) {
  const role = opts.role ?? "admin";
  const failOnIds = opts.failOnIds ?? new Set<string>();
  const updates: Array<{ id: string; status: string }> = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "viewer-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { role }, error: null }),
          }),
        }),
      };
    }
    if (table === "reengagement_campaigns") {
      return {
        update: (patch: { status: string }) => ({
          eq: (_col: string, id: string) => {
            updates.push({ id, status: patch.status });
            if (failOnIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced fail ${id}` },
              });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { updates };
}

describe("bulkUpdateCampaignStatus", () => {
  it("rejects unauthenticated callers", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await bulkUpdateCampaignStatus(["a"], "active");
    expect(res.error).toBe("Not authenticated");
  });

  it("rejects callers without admin/ops role", async () => {
    installHarness({ role: "coach" });
    const res = await bulkUpdateCampaignStatus(["a"], "paused");
    expect(res.error).toBe("Insufficient permissions");
  });

  it("returns empty result when no ids passed", async () => {
    installHarness({ role: "admin" });
    const res = await bulkUpdateCampaignStatus([], "active");
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ succeeded: 0, failed: [] });
  });

  it("updates the status for each provided id (happy path)", async () => {
    const { updates } = installHarness({ role: "admin" });
    const res = await bulkUpdateCampaignStatus(
      ["a", "b", "c"],
      "paused"
    );
    expect(res.data?.succeeded).toBe(3);
    expect(updates.every((u) => u.status === "paused")).toBe(true);
    expect(updates.map((u) => u.id)).toEqual(["a", "b", "c"]);
  });

  it("surfaces partial failures per id", async () => {
    installHarness({ role: "ops", failOnIds: new Set(["b"]) });
    const res = await bulkUpdateCampaignStatus(["a", "b"], "active");
    expect(res.data?.succeeded).toBe(1);
    expect(res.data?.failed).toHaveLength(1);
    expect(res.data?.failed[0].id).toBe("b");
  });
});
