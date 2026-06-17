import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Shared mocks — vi.hoisted so the module-mocks see them before SUT imports.
// ---------------------------------------------------------------------------
const { supabaseMock, adminMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
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

// SUT imports
import {
  normaliseAuPhone,
  TwilioProvider,
} from "../twilio-provider";
import { MockSmsProvider } from "../mock-provider";
import { getSmsProvider, __resetSmsProviderForTests } from "../index";
import { sendSms, sendUrgentNotificationViaSms } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  // Restore any env stubs and reset the cached provider so a test that
  // sets credentials doesn't leak into the next case.
  vi.unstubAllEnvs();
  __resetSmsProviderForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. Phone normalisation
// ---------------------------------------------------------------------------

describe("normaliseAuPhone", () => {
  it("normalises 04xx local mobile to +614xx, leaves +61 alone, rejects garbage", () => {
    // 04xx → +614xx
    expect(normaliseAuPhone("0412345678")).toBe("+61412345678");
    // Whitespace and dashes tolerated
    expect(normaliseAuPhone("0412 345 678")).toBe("+61412345678");
    expect(normaliseAuPhone("04-12-34-56-78")).toBe("+61412345678");
    // Already E.164
    expect(normaliseAuPhone("+61412345678")).toBe("+61412345678");
    // 614 without plus is upgraded
    expect(normaliseAuPhone("61412345678")).toBe("+61412345678");
    // Invalid formats rejected
    expect(normaliseAuPhone("12345")).toBeNull();
    expect(normaliseAuPhone("+15551234567")).toBeNull(); // US number — out of scope
    expect(normaliseAuPhone("not-a-phone")).toBeNull();
    expect(normaliseAuPhone("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Mock provider chosen in dev when Twilio creds missing
// ---------------------------------------------------------------------------

describe("getSmsProvider", () => {
  it("returns the MockSmsProvider in dev when Twilio creds are missing", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    vi.stubEnv("NODE_ENV", "test"); // non-prod
    __resetSmsProviderForTests();

    const provider = getSmsProvider();
    expect(provider).toBeInstanceOf(MockSmsProvider);
    expect(provider.isConfigured()).toBe(true);
  });

  it("returns the TwilioProvider when all three creds are present", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok123";
    process.env.TWILIO_FROM_NUMBER = "+61400000000";
    __resetSmsProviderForTests();

    const provider = getSmsProvider();
    expect(provider).toBeInstanceOf(TwilioProvider);
    expect(provider.isConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Twilio request shape — verify URL, basic auth, body params
// ---------------------------------------------------------------------------

describe("TwilioProvider.send", () => {
  it("builds the correct REST request and basic-auth header on success", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok123";
    process.env.TWILIO_FROM_NUMBER = "+61400000000";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ sid: "SM_abc123" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );

    const provider = new TwilioProvider();
    const result = await provider.send("0412345678", "hello");

    expect(result).toEqual({ id: "SM_abc123", error: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );

    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("AC123:tok123").toString("base64")}`,
    );
    expect(headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const bodyParams = new URLSearchParams(init?.body as string);
    expect(bodyParams.get("From")).toBe("+61400000000");
    expect(bodyParams.get("To")).toBe("+61412345678"); // normalised
    expect(bodyParams.get("Body")).toBe("hello");

    fetchSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // 4. Twilio non-200 → error string surfaces, no provider id
  // ---------------------------------------------------------------------------
  it("returns the error message string on non-200 responses", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok123";
    process.env.TWILIO_FROM_NUMBER = "+61400000000";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Invalid 'To' Phone Number", code: 21211 }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      );

    const provider = new TwilioProvider();
    const result = await provider.send("0412345678", "hello");

    expect(result.id).toBeNull();
    expect(result.error).toMatch(/Invalid 'To' Phone Number/);

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Helpers to install supabase fixtures for the actions tests.
// ---------------------------------------------------------------------------

/** Auth as admin actor "actor-1" */
function authAsAdmin() {
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "actor-1" } },
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: { role: "admin" } }) }),
        }),
      };
    }
    return {};
  });
}

/** Mock admin-client fan-out for sendSms: profile lookup + sms_log insert. */
function mockSendSmsAdminFanOut(opts: {
  recipientPhone: string | null;
  insertSpy?: ReturnType<typeof vi.fn>;
}) {
  adminMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: opts.recipientPhone
                  ? { id: "target-1", phone: opts.recipientPhone }
                  : { id: "target-1", phone: null },
              }),
          }),
        }),
      };
    }
    if (table === "sms_log") {
      return {
        insert: opts.insertSpy ?? vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return {};
  });
}

// ---------------------------------------------------------------------------
// 5. sendSms records sms_log row on success
// ---------------------------------------------------------------------------

describe("sendSms", () => {
  it("writes a sent sms_log row when the provider succeeds", async () => {
    // Force mock provider — in dev, MockSmsProvider.send always succeeds
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    __resetSmsProviderForTests();

    authAsAdmin();
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSendSmsAdminFanOut({ recipientPhone: "0412345678", insertSpy });

    const result = await sendSms({ userId: "target-1", body: "hi" });

    expect(result.error).toBeNull();
    expect(result.id).toMatch(/^mock-/);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.user_id).toBe("target-1");
    expect(inserted.to_phone).toBe("+61412345678");
    expect(inserted.body).toBe("hi");
    expect(inserted.provider).toBe("mock");
    expect(inserted.status).toBe("sent");
    expect(inserted.error).toBeNull();
    expect(inserted.sent_at).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 6. sendSms records sms_log row with error on failure
  // ---------------------------------------------------------------------------
  it("writes a failed sms_log row when the provider returns an error", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok123";
    process.env.TWILIO_FROM_NUMBER = "+61400000000";
    __resetSmsProviderForTests();

    // Make fetch reject with a non-200 so TwilioProvider surfaces an error.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );

    authAsAdmin();
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSendSmsAdminFanOut({ recipientPhone: "0412345678", insertSpy });

    const result = await sendSms({ userId: "target-1", body: "hi" });

    expect(result.id).toBeNull();
    expect(result.error).toMatch(/boom/);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.provider).toBe("twilio");
    expect(inserted.status).toBe("failed");
    expect(inserted.error).toMatch(/boom/);
    expect(inserted.sent_at).toBeNull();

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 7. sendUrgentNotificationViaSms skips silently when opt-in is false
// ---------------------------------------------------------------------------

describe("sendUrgentNotificationViaSms", () => {
  it("skips silently when sms_opt_in is false", async () => {
    vi.stubEnv("NODE_ENV", "test");
    __resetSmsProviderForTests();

    const insertSpy = vi.fn();
    adminMock.from.mockImplementation((table: string) => {
      if (table === "notifications") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "notif-1",
                    user_id: "user-1",
                    title: "Shift",
                    body: "Tomorrow 9am",
                    tier: "urgent",
                  },
                }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "user-1",
                    phone: "0412345678",
                    sms_opt_in: false,
                  },
                }),
            }),
          }),
        };
      }
      if (table === "sms_log") {
        return { insert: insertSpy };
      }
      return {};
    });

    const result = await sendUrgentNotificationViaSms("notif-1");
    expect(result).toEqual({ id: null, error: null });
    // Critically — no audit row, because we never attempted a send.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 8. sendUrgentNotificationViaSms skips when phone is missing
  // ---------------------------------------------------------------------------
  it("skips silently when the recipient has no phone on file", async () => {
    vi.stubEnv("NODE_ENV", "test");
    __resetSmsProviderForTests();

    const insertSpy = vi.fn();
    adminMock.from.mockImplementation((table: string) => {
      if (table === "notifications") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "notif-1",
                    user_id: "user-1",
                    title: "Shift",
                    body: "Tomorrow 9am",
                    tier: "urgent",
                  },
                }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "user-1", phone: null, sms_opt_in: true },
                }),
            }),
          }),
        };
      }
      if (table === "sms_log") {
        return { insert: insertSpy };
      }
      return {};
    });

    const result = await sendUrgentNotificationViaSms("notif-1");
    expect(result).toEqual({ id: null, error: null });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
