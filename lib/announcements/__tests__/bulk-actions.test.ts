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

// triggerNotification is imported by actions.ts but not used by the
// bulk-delete path; mock to a no-op so the import resolves.
vi.mock("@/lib/notifications/send", () => ({
  triggerNotification: vi.fn(),
}));

import { bulkDeleteAnnouncements } from "../actions";

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
  const deletedReads: string[] = [];
  const deletedAnnouncements: string[] = [];

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
    if (table === "announcement_reads") {
      return {
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletedReads.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "announcements") {
      return {
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletedAnnouncements.push(id);
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

  return { deletedReads, deletedAnnouncements };
}

describe("bulkDeleteAnnouncements", () => {
  it("rejects unauthenticated callers", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await bulkDeleteAnnouncements(["a"]);
    expect(res.error).toBe("Not authenticated");
  });

  it("rejects callers without admin/ops role", async () => {
    installHarness({ role: "coach" });
    const res = await bulkDeleteAnnouncements(["a"]);
    expect(res.error).toBe("Insufficient permissions");
  });

  it("returns empty result when no ids passed", async () => {
    installHarness({ role: "admin" });
    const res = await bulkDeleteAnnouncements([]);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ succeeded: 0, failed: [] });
  });

  it("deletes read receipts and announcements for each id (happy path)", async () => {
    const { deletedReads, deletedAnnouncements } = installHarness({
      role: "admin",
    });
    const res = await bulkDeleteAnnouncements(["a", "b"]);
    expect(res.data?.succeeded).toBe(2);
    expect(deletedReads).toEqual(["a", "b"]);
    expect(deletedAnnouncements).toEqual(["a", "b"]);
  });

  it("surfaces partial failures per id", async () => {
    installHarness({ role: "ops", failOnIds: new Set(["b"]) });
    const res = await bulkDeleteAnnouncements(["a", "b"]);
    expect(res.data?.succeeded).toBe(1);
    expect(res.data?.failed).toHaveLength(1);
    expect(res.data?.failed[0].id).toBe("b");
  });
});
