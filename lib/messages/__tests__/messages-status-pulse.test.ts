import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, adminMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
  },
  adminMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));

import { getMessagesStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// Fan-out:
//   1. direct_messages head count: unread (recipient=me, read_at=null,
//      deleted_at=null)
//   2. direct_messages head count: sent today (sender=me,
//      created_at>=today)
//   3. direct_messages select(id, recipient_id, created_at): mine in
//      last 7d
//   Then per partner found above:
//   4. direct_messages select(sender_id, created_at) for the
//      conversation, order desc, limit 1, maybeSingle()

interface PulseFixture {
  authed?: boolean;
  unreadCount?: number;
  sentTodayCount?: number;
  recentMine?: Array<{ recipient_id: string; created_at: string }>;
  latestPerPartner?: Record<
    string,
    { sender_id: string; created_at: string } | null
  >;
}

function installFixture(opts: PulseFixture) {
  const authed = opts.authed ?? true;
  const unreadCount = opts.unreadCount ?? 0;
  const sentTodayCount = opts.sentTodayCount ?? 0;
  const recentMine = opts.recentMine ?? [];
  const latestPerPartner = opts.latestPerPartner ?? {};

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: authed ? { id: "viewer-1" } : null },
  });

  let dmCall = 0;
  let lastOrFilter = "";

  adminMock.from.mockImplementation((table: string) => {
    if (table === "direct_messages") {
      dmCall += 1;
      if (dmCall === 1) {
        // Unread head count chain: .select(id, count, head).eq.is.is
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            eq: () => ({
              is: () => ({
                is: () =>
                  Promise.resolve({
                    count: opts2?.head ? unreadCount : 0,
                    data: null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (dmCall === 2) {
        // Sent-today head count: .select.eq.gte
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({
                  count: opts2?.head ? sentTodayCount : 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (dmCall === 3) {
        // Recent mine: .select(...).eq("sender_id",me).gte("created_at",7d).order()
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                order: () =>
                  Promise.resolve({ data: recentMine, error: null }),
              }),
            }),
          }),
        };
      }
      // Per-partner: .select(...).or(...).order().limit().maybeSingle()
      return {
        select: () => ({
          or: (filter: string) => {
            lastOrFilter = filter;
            return {
              order: () => ({
                limit: () => ({
                  maybeSingle: () => {
                    // Parse out the partner id from the .or filter
                    // string — the filter contains
                    // "recipient_id.eq.<partner>" twice; we extract
                    // any UUID-shaped token.
                    let partner = "";
                    const m = lastOrFilter.match(
                      /recipient_id\.eq\.([^,)]+)/
                    );
                    if (m) partner = m[1];
                    return Promise.resolve({
                      data: latestPerPartner[partner] ?? null,
                      error: null,
                    });
                  },
                }),
              }),
            };
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getMessagesStatusPulse", () => {
  it("returns zeros when not authenticated", async () => {
    installFixture({ authed: false });
    const pulse = await getMessagesStatusPulse();
    expect(pulse).toEqual({
      unreadCount: 0,
      awaitingResponseCount: 0,
      sentTodayCount: 0,
      mentionsCount: 0,
    });
  });

  it("passes unread + sent-today counts through", async () => {
    installFixture({ unreadCount: 4, sentTodayCount: 2 });
    const pulse = await getMessagesStatusPulse();
    expect(pulse.unreadCount).toBe(4);
    expect(pulse.sentTodayCount).toBe(2);
  });

  it("counts awaiting-response when latest message is from me", async () => {
    installFixture({
      recentMine: [
        { recipient_id: "p1", created_at: "2026-06-15T10:00:00Z" },
      ],
      latestPerPartner: {
        p1: {
          sender_id: "viewer-1",
          created_at: "2026-06-15T10:00:00Z",
        },
      },
    });
    const pulse = await getMessagesStatusPulse();
    expect(pulse.awaitingResponseCount).toBe(1);
  });

  it("does NOT count awaiting when partner has since replied", async () => {
    installFixture({
      recentMine: [
        { recipient_id: "p1", created_at: "2026-06-15T10:00:00Z" },
      ],
      latestPerPartner: {
        p1: { sender_id: "p1", created_at: "2026-06-15T11:00:00Z" },
      },
    });
    const pulse = await getMessagesStatusPulse();
    expect(pulse.awaitingResponseCount).toBe(0);
  });

  it("mentions always 0 today (not modelled)", async () => {
    installFixture({ unreadCount: 5 });
    const pulse = await getMessagesStatusPulse();
    expect(pulse.mentionsCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.auth.getUser.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getMessagesStatusPulse();
    expect(pulse).toEqual({
      unreadCount: 0,
      awaitingResponseCount: 0,
      sentTodayCount: 0,
      mentionsCount: 0,
    });
  });
});
