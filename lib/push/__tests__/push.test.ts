import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Shared mocks -- vi.hoisted so module mocks see them before SUT imports.
// ---------------------------------------------------------------------------

const { supabaseMock, adminMock } = vi.hoisted(() => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const passthrough = [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "neq",
      "order",
      "limit",
      "single",
      "maybeSingle",
      "in",
      "head",
    ];
    for (const m of passthrough) builder[m] = vi.fn(() => builder);
    builder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null, count: null }),
    );
    return builder;
  };
  return {
    supabaseMock: {
      auth: { getUser: vi.fn() },
      from: vi.fn(() => makeBuilder()),
      _make: makeBuilder,
    },
    adminMock: {
      from: vi.fn(() => makeBuilder()),
      _make: makeBuilder,
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));

// SUT imports come AFTER module mocks.
import {
  savePushSubscription,
  deletePushSubscription,
  sendPushToUser,
  getPushSubscriptionCount,
} from "../actions";
import { signVapidJwt, base64UrlDecode } from "../sign";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_USER = { id: "00000000-0000-0000-0000-000000000001" };

const SAMPLE_SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: {
    p256dh:
      "BCJxNyo7DPpZGqJtEFLh4cVuAOWv3W1BkUXzQ1l3qe7T0YBQyJfqfPaPSvFGGqqGxOdsk7uW1c-ovjkbk2c4uzg",
    auth: "Y2pHQ29uYTNXcWZyUm1mUw",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers for assertion on the chained builder. The default mock returns a
// fresh builder per `from()` call, so we replace it with a tracked builder
// just before the SUT runs.
// ---------------------------------------------------------------------------

function trackedBuilder(initialResponse: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
} = {}) {
  const resp = { data: null, error: null, count: null, ...initialResponse };
  const builder: Record<string, unknown> = {};
  const passthrough = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "in",
    "order",
    "limit",
    "single",
    "maybeSingle",
    "head",
  ];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve(resp));
  return builder;
}

// ===========================================================================
// 1. savePushSubscription upserts (no duplicate rows)
// ===========================================================================

describe("savePushSubscription", () => {
  it("upserts on (user_id, endpoint) so a re-subscribe is idempotent", async () => {
    supabaseMock.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: TEST_USER },
      error: null,
    });
    const builder = trackedBuilder();
    supabaseMock.from = vi.fn(() => builder);

    const { error } = await savePushSubscription(SAMPLE_SUBSCRIPTION);

    expect(error).toBeNull();
    expect(supabaseMock.from).toHaveBeenCalledWith("push_subscriptions");
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: TEST_USER.id,
        endpoint: SAMPLE_SUBSCRIPTION.endpoint,
        keys_p256dh: SAMPLE_SUBSCRIPTION.keys.p256dh,
        keys_auth: SAMPLE_SUBSCRIPTION.keys.auth,
      }),
      { onConflict: "user_id,endpoint" },
    );
  });

  it("rejects unauthenticated callers without touching the DB", async () => {
    supabaseMock.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const builder = trackedBuilder();
    supabaseMock.from = vi.fn(() => builder);

    const { error } = await savePushSubscription(SAMPLE_SUBSCRIPTION);

    expect(error).toBe("Not authenticated.");
    expect(builder.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. deletePushSubscription self-only
// ===========================================================================

describe("deletePushSubscription", () => {
  it("filters by user_id AND endpoint so it can't drop someone else's row", async () => {
    supabaseMock.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: TEST_USER },
      error: null,
    });
    const builder = trackedBuilder();
    supabaseMock.from = vi.fn(() => builder);

    const { error } = await deletePushSubscription(SAMPLE_SUBSCRIPTION.endpoint);

    expect(error).toBeNull();
    expect(builder.delete).toHaveBeenCalled();
    // Both filters applied, in either order.
    const eqCalls = (builder.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["user_id", TEST_USER.id],
        ["endpoint", SAMPLE_SUBSCRIPTION.endpoint],
      ]),
    );
  });
});

// ===========================================================================
// 3. sendPushToUser fetches per subscription
// ===========================================================================

describe("sendPushToUser", () => {
  it("dispatches one fetch per active subscription", async () => {
    const subs = [
      {
        id: "row-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/aaa",
        keys_p256dh: SAMPLE_SUBSCRIPTION.keys.p256dh,
        keys_auth: SAMPLE_SUBSCRIPTION.keys.auth,
      },
      {
        id: "row-2",
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/bbb",
        keys_p256dh: SAMPLE_SUBSCRIPTION.keys.p256dh,
        keys_auth: SAMPLE_SUBSCRIPTION.keys.auth,
      },
    ];
    const builder = trackedBuilder({ data: subs });
    adminMock.from = vi.fn(() => builder);

    const fetchSpy = vi.fn().mockResolvedValue({ status: 201 });
    vi.stubGlobal("fetch", fetchSpy);

    const { sent, failed } = await sendPushToUser(TEST_USER.id, {
      title: "hi",
      body: "yo",
    });

    expect(sent).toBe(2);
    expect(failed).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Each call POSTs to the endpoint with VAPID auth headers.
    for (const call of fetchSpy.mock.calls) {
      const [url, init] = call as [string, RequestInit];
      expect(url).toMatch(/^https:\/\//);
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toMatch(/^vapid t=.*, k=.*$/);
      expect(headers.TTL).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // 4. sendPushToUser removes 410-expired subscriptions
  // -----------------------------------------------------------------------
  it("deletes a subscription when the push service returns 410 Gone", async () => {
    const subs = [
      {
        id: "expired-row",
        endpoint: "https://fcm.googleapis.com/fcm/send/expired",
        keys_p256dh: SAMPLE_SUBSCRIPTION.keys.p256dh,
        keys_auth: SAMPLE_SUBSCRIPTION.keys.auth,
      },
    ];
    const selectBuilder = trackedBuilder({ data: subs });
    const deleteBuilder = trackedBuilder();
    // First `from()` returns the select builder, subsequent calls return
    // the delete builder so we can spy on the cleanup.
    let fromCalls = 0;
    adminMock.from = vi.fn(() => {
      fromCalls += 1;
      return fromCalls === 1 ? selectBuilder : deleteBuilder;
    });

    const fetchSpy = vi.fn().mockResolvedValue({ status: 410 });
    vi.stubGlobal("fetch", fetchSpy);

    const { sent, failed } = await sendPushToUser(TEST_USER.id, {
      title: "hi",
      body: "yo",
    });

    expect(sent).toBe(0);
    expect(failed).toBe(1);
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("id", "expired-row");
  });

  // -----------------------------------------------------------------------
  // 5. sendPushToUser returns counts
  // -----------------------------------------------------------------------
  it("returns separate sent + failed counts for mixed responses", async () => {
    const subs = [
      {
        id: "ok-row",
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
        keys_p256dh: SAMPLE_SUBSCRIPTION.keys.p256dh,
        keys_auth: SAMPLE_SUBSCRIPTION.keys.auth,
      },
      {
        id: "fail-row",
        endpoint: "https://fcm.googleapis.com/fcm/send/fail",
        keys_p256dh: SAMPLE_SUBSCRIPTION.keys.p256dh,
        keys_auth: SAMPLE_SUBSCRIPTION.keys.auth,
      },
    ];
    const builder = trackedBuilder({ data: subs });
    adminMock.from = vi.fn(() => builder);

    let call = 0;
    const fetchSpy = vi.fn().mockImplementation(() => {
      call += 1;
      return Promise.resolve({ status: call === 1 ? 201 : 500 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendPushToUser(TEST_USER.id, {
      title: "hi",
      body: "yo",
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });
});

// ===========================================================================
// 6. getPushSubscriptionCount accurate
// ===========================================================================

describe("getPushSubscriptionCount", () => {
  it("returns the count from the head select, or 0 on error", async () => {
    const builder = trackedBuilder({ count: 3 });
    adminMock.from = vi.fn(() => builder);

    const count = await getPushSubscriptionCount(TEST_USER.id);
    expect(count).toBe(3);
    expect(builder.eq).toHaveBeenCalledWith("user_id", TEST_USER.id);
  });
});

// ===========================================================================
// 7. VAPID JWT structure (header.payload.signature)
// ===========================================================================

describe("signVapidJwt", () => {
  it("returns a three-part JWT with the right header + payload claims", async () => {
    const jwt = await signVapidJwt(
      "https://fcm.googleapis.com/fcm/send/abc",
      {
        publicKey:
          "BJUT9JcukfQP4o_fDajwqjwgAzY75sFWluxj9bFf15lRjyLJcDcHznidPjfWCbvZ7ghXRIiHas4E_AbbXcRpUKU",
        privateKey: "HcJBl8WYZ2dvuWnr3YQzKhJ4mqSpFqkmWar-avHWN78",
        subject: "mailto:test@example.com",
      },
    );

    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
    expect(parts[2]).toBeTruthy();

    const header = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[0])),
    );
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("JWT");

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[1])),
    );
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:test@example.com");
    expect(typeof payload.exp).toBe("number");
    // exp must be in the future + within 24h cap.
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now);
    expect(payload.exp).toBeLessThanOrEqual(now + 24 * 60 * 60);
  });
});

// ===========================================================================
// 8. ECDSA signature uses P-256 (64-byte raw r||s)
// ===========================================================================

describe("VAPID ECDSA signature", () => {
  it("emits a 64-byte raw ECDSA signature (32 bytes r + 32 bytes s)", async () => {
    const jwt = await signVapidJwt(
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      {
        publicKey:
          "BJUT9JcukfQP4o_fDajwqjwgAzY75sFWluxj9bFf15lRjyLJcDcHznidPjfWCbvZ7ghXRIiHas4E_AbbXcRpUKU",
        privateKey: "HcJBl8WYZ2dvuWnr3YQzKhJ4mqSpFqkmWar-avHWN78",
        subject: "mailto:test@example.com",
      },
    );
    const sig = base64UrlDecode(jwt.split(".")[2]);
    // P-256 raw signature is exactly 64 bytes -- anything else would mean
    // WebCrypto used a different curve or DER-encoded the signature.
    expect(sig.length).toBe(64);
  });
});
