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

// Don't bother revalidatePath in tests
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  bulkApproveTestimonials,
  bulkRejectTestimonials,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// Pattern:
//   1. auth.getUser() → user id
//   2. profiles.select(role).eq().single() → role gate
//   3. feedback_ratings.select(...).in('id', ids) → fetch source rows
//   4. approved_testimonials.select(feedback_rating_id).in() → skip
//      list (idempotent)
//   5. per id: approved_testimonials.insert(...) → success or fail

interface HarnessOpts {
  role?: "admin" | "ops" | "coach";
  feedbackRows?: Array<{
    id: string;
    rating: number;
    comment: string;
    centre_id: string;
    centres: { name?: string; primary_contact_name?: string } | null;
  }>;
  alreadyApprovedIds?: string[];
  failOnIds?: Set<string>;
}

function installHarness(opts: HarnessOpts = {}) {
  const role = opts.role ?? "admin";
  const feedbackRows = opts.feedbackRows ?? [];
  const alreadyApprovedIds = opts.alreadyApprovedIds ?? [];
  const failOnIds = opts.failOnIds ?? new Set<string>();

  const inserts: Array<{
    feedback_rating_id: string;
    status: string;
  }> = [];

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
    if (table === "feedback_ratings") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: feedbackRows, error: null }),
        }),
      };
    }
    if (table === "approved_testimonials") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: alreadyApprovedIds.map((id) => ({
                feedback_rating_id: id,
              })),
              error: null,
            }),
        }),
        insert: (
          row: { feedback_rating_id: string; status: string }
        ) => {
          inserts.push(row);
          if (failOnIds.has(row.feedback_rating_id)) {
            return Promise.resolve({
              error: { message: `forced fail ${row.feedback_rating_id}` },
            });
          }
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { inserts };
}

describe("bulkApproveTestimonials", () => {
  it("rejects unauthenticated callers", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await bulkApproveTestimonials(["a", "b"]);
    expect(res.error).toBe("Not authenticated");
    expect(res.data).toBeNull();
  });

  it("rejects callers without admin/ops role", async () => {
    installHarness({ role: "coach" });
    const res = await bulkApproveTestimonials(["a"]);
    expect(res.error).toBe("Insufficient permissions");
    expect(res.data).toBeNull();
  });

  it("returns empty result when no ids passed", async () => {
    installHarness({ role: "admin" });
    const res = await bulkApproveTestimonials([]);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ succeeded: 0, failed: [] });
  });

  it("inserts approved rows for each fresh feedback id", async () => {
    const { inserts } = installHarness({
      role: "admin",
      feedbackRows: [
        {
          id: "f1",
          rating: 5,
          comment: "great",
          centre_id: "c1",
          centres: { name: "Sunshine ELC", primary_contact_name: "Jane" },
        },
        {
          id: "f2",
          rating: 4,
          comment: "ok",
          centre_id: "c2",
          centres: { name: "Maple Park" },
        },
      ],
    });
    const res = await bulkApproveTestimonials(["f1", "f2"]);
    expect(res.error).toBeNull();
    expect(res.data?.succeeded).toBe(2);
    expect(res.data?.failed).toEqual([]);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((r) => r.status === "approved")).toBe(true);
  });

  it("skips already-approved ids silently", async () => {
    const { inserts } = installHarness({
      role: "admin",
      feedbackRows: [
        {
          id: "f1",
          rating: 5,
          comment: "great",
          centre_id: "c1",
          centres: { name: "Sunshine ELC" },
        },
        {
          id: "f2",
          rating: 4,
          comment: "ok",
          centre_id: "c2",
          centres: { name: "Maple Park" },
        },
      ],
      alreadyApprovedIds: ["f1"],
    });
    const res = await bulkApproveTestimonials(["f1", "f2"]);
    expect(res.data?.succeeded).toBe(1); // f1 skipped
    expect(inserts).toHaveLength(1);
    expect(inserts[0].feedback_rating_id).toBe("f2");
  });

  it("surfaces partial failures per id", async () => {
    installHarness({
      role: "admin",
      feedbackRows: [
        {
          id: "f1",
          rating: 5,
          comment: "great",
          centre_id: "c1",
          centres: { name: "A" },
        },
        {
          id: "f2",
          rating: 4,
          comment: "ok",
          centre_id: "c2",
          centres: { name: "B" },
        },
      ],
      failOnIds: new Set(["f2"]),
    });
    const res = await bulkApproveTestimonials(["f1", "f2"]);
    expect(res.data?.succeeded).toBe(1);
    expect(res.data?.failed).toHaveLength(1);
    expect(res.data?.failed[0].id).toBe("f2");
  });
});

describe("bulkRejectTestimonials", () => {
  it("rejects callers without admin/ops role", async () => {
    installHarness({ role: "coach" });
    const res = await bulkRejectTestimonials(["a"]);
    expect(res.error).toBe("Insufficient permissions");
  });

  it("inserts rejected rows for fresh ids", async () => {
    const { inserts } = installHarness({
      role: "ops",
      alreadyApprovedIds: [],
    });
    const res = await bulkRejectTestimonials(["f1", "f2"]);
    expect(res.data?.succeeded).toBe(2);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((r) => r.status === "rejected")).toBe(true);
  });
});
