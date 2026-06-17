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

import { getAnnouncementsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// Fan-out (initial parallel batch):
//   1. announcements head count where created_at >= Monday
//   2. announcements head count where created_at >= first-of-month
//   3. announcements select('id, audience') where created_at >= 30d-ago
//   4. profiles select('role') where status='active'
// Then per low-read candidate:
//   5. announcement_reads head count where announcement_id=id

interface PulseFixture {
  userId?: string | null;
  sentThisWeekCount?: number;
  sentThisMonthCount?: number;
  lowReadCandidates?: Array<{ id: string; audience: string }>;
  activeProfiles?: Array<{ role: string }>;
  readCountsById?: Record<string, number>;
}

function installFixture(opts: PulseFixture) {
  const userId = opts.userId ?? "viewer-1";
  const sentThisWeekCount = opts.sentThisWeekCount ?? 0;
  const sentThisMonthCount = opts.sentThisMonthCount ?? 0;
  const lowReadCandidates = opts.lowReadCandidates ?? [];
  const activeProfiles = opts.activeProfiles ?? [];
  const readCountsById = opts.readCountsById ?? {};

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
  });

  let announcementsCall = 0;
  let lastReadId: string | null = null;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "announcements") {
      announcementsCall += 1;
      if (announcementsCall === 1) {
        // Sent-this-week head count: select(...).gte("created_at",monday)
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? sentThisWeekCount : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      if (announcementsCall === 2) {
        // Sent-this-month head count
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? sentThisMonthCount : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      if (announcementsCall === 3) {
        // Low-read candidates: select("id, audience").gte("created_at", 30d-ago)
        return {
          select: () => ({
            gte: () =>
              Promise.resolve({ data: lowReadCandidates, error: null }),
          }),
        };
      }
      // Subsequent: unread-by-me uses .select("id").gte("created_at", 30d-ago)
      return {
        select: () => ({
          gte: () =>
            Promise.resolve({
              data: lowReadCandidates.map((c) => ({ id: c.id })),
              error: null,
            }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ data: activeProfiles, error: null }),
        }),
      };
    }
    if (table === "announcement_reads") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => {
          // .eq path returns a thenable that also has .in chained
          // off of it so both call shapes work:
          //   - head count: select(...).eq("announcement_id", id) → await
          //   - mine-unread: select(...).eq("user_id", me).in(...) → await
          const eqCall = (_col: string, value: string) => {
            lastReadId = value;
            const headPromise: PromiseLike<unknown> & {
              in: () => Promise<unknown>;
            } = Promise.resolve({
              count: opts2?.head ? readCountsById[lastReadId] ?? 0 : 0,
              data: null,
              error: null,
            }) as unknown as PromiseLike<unknown> & {
              in: () => Promise<unknown>;
            };
            headPromise.in = () =>
              Promise.resolve({
                // Treat all candidates as read by viewer in this stub
                // so unread-by-me is 0 unless the fixture says otherwise.
                data: lowReadCandidates.map((c) => ({
                  announcement_id: c.id,
                })),
                error: null,
              });
            return headPromise;
          };
          return { eq: eqCall };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getAnnouncementsStatusPulse", () => {
  it("returns clean zeros on a fresh org", async () => {
    installFixture({});
    const pulse = await getAnnouncementsStatusPulse();
    expect(pulse).toEqual({
      sentThisWeekCount: 0,
      sentThisMonthCount: 0,
      lowReadCount: 0,
      unreadByMeCount: 0,
    });
  });

  it("passes sent-this-week and sent-this-month counts through", async () => {
    installFixture({
      sentThisWeekCount: 3,
      sentThisMonthCount: 12,
    });
    const pulse = await getAnnouncementsStatusPulse();
    expect(pulse.sentThisWeekCount).toBe(3);
    expect(pulse.sentThisMonthCount).toBe(12);
  });

  it("counts a candidate as low-read when read_count/audience < 30%", async () => {
    installFixture({
      lowReadCandidates: [{ id: "a1", audience: "all" }],
      activeProfiles: Array.from({ length: 10 }, () => ({ role: "coach" })),
      readCountsById: { a1: 2 }, // 2/10 = 20% → low.
    });
    const pulse = await getAnnouncementsStatusPulse();
    expect(pulse.lowReadCount).toBe(1);
  });

  it("does NOT flag low-read when rate >= 30%", async () => {
    installFixture({
      lowReadCandidates: [{ id: "a1", audience: "all" }],
      activeProfiles: Array.from({ length: 10 }, () => ({ role: "coach" })),
      readCountsById: { a1: 4 }, // 4/10 = 40% → fine.
    });
    const pulse = await getAnnouncementsStatusPulse();
    expect(pulse.lowReadCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getAnnouncementsStatusPulse();
    expect(pulse).toEqual({
      sentThisWeekCount: 0,
      sentThisMonthCount: 0,
      lowReadCount: 0,
      unreadByMeCount: 0,
    });
  });
});
