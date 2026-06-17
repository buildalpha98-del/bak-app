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

import { getDocumentsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — input-based per-table routing
// ============================================================
//
// The action fans out to `documents` 4 times. Each call differs by
// chain shape, so we route by call index:
//   1. uploaded this week  — .gte()
//   2. pending review      — .contains()
//   3. expiring soon       — .eq().lt()
//   4. no tags             — .or()

interface PulseFixture {
  uploaded?: number;
  pending?: number;
  expiring?: number;
  noTags?: number;
}

function installFixture(opts: PulseFixture) {
  const uploaded = opts.uploaded ?? 0;
  const pending = opts.pending ?? 0;
  const expiring = opts.expiring ?? 0;
  const noTags = opts.noTags ?? 0;

  let documentsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "documents") {
      throw new Error(`unexpected table ${table}`);
    }
    documentsCall += 1;
    const callNum = documentsCall;

    return {
      select: (
        _cols: string,
        opts2?: { count?: string; head?: boolean },
      ) => {
        const isHead = opts2?.head === true;

        // Call 1: uploaded this week — .gte()
        if (callNum === 1) {
          return {
            gte: () =>
              Promise.resolve({
                count: isHead ? uploaded : 0,
                data: null,
                error: null,
              }),
          };
        }
        // Call 2: pending review — .contains()
        if (callNum === 2) {
          return {
            contains: () =>
              Promise.resolve({
                count: isHead ? pending : 0,
                data: null,
                error: null,
              }),
          };
        }
        // Call 3: expiring soon — .eq().lt()
        if (callNum === 3) {
          return {
            eq: () => ({
              lt: () =>
                Promise.resolve({
                  count: isHead ? expiring : 0,
                  data: null,
                  error: null,
                }),
            }),
          };
        }
        // Call 4: no tags — .or()
        if (callNum === 4) {
          return {
            or: () =>
              Promise.resolve({
                count: isHead ? noTags : 0,
                data: null,
                error: null,
              }),
          };
        }
        throw new Error(`unexpected documents call #${callNum}`);
      },
    };
  });
}

// ============================================================
// Cases
// ============================================================

describe("getDocumentsStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getDocumentsStatusPulse();
    expect(pulse).toEqual({
      uploadedThisWeekCount: 0,
      pendingReviewCount: 0,
      expiringSoonCount: 0,
      noTagsCount: 0,
    });
  });

  it("passes the uploaded-this-week head count through", async () => {
    installFixture({ uploaded: 4 });
    const pulse = await getDocumentsStatusPulse();
    expect(pulse.uploadedThisWeekCount).toBe(4);
  });

  it("passes the pending-review (tag-scoped) head count through", async () => {
    installFixture({ pending: 7 });
    const pulse = await getDocumentsStatusPulse();
    expect(pulse.pendingReviewCount).toBe(7);
  });

  it("passes the expiring-soon (compliance + age) head count through", async () => {
    installFixture({ expiring: 2 });
    const pulse = await getDocumentsStatusPulse();
    expect(pulse.expiringSoonCount).toBe(2);
  });

  it("passes the untagged head count through", async () => {
    installFixture({ noTags: 9 });
    const pulse = await getDocumentsStatusPulse();
    expect(pulse.noTagsCount).toBe(9);
  });

  it("swallows thrown errors and returns all zeros (hard-fail safety net)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getDocumentsStatusPulse();
    expect(pulse).toEqual({
      uploadedThisWeekCount: 0,
      pendingReviewCount: 0,
      expiringSoonCount: 0,
      noTagsCount: 0,
    });
  });
});
