import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted so these references exist before the hoisted vi.mock factories run.
const { supabaseMock, triggerNotificationMock, sendEmailMock, headersMock } =
  vi.hoisted(() => ({
    supabaseMock: { from: vi.fn() },
    triggerNotificationMock: vi.fn(),
    sendEmailMock: vi.fn(),
    headersMock: vi.fn(),
  }));

// Overrides the global admin mock in tests/setup.ts for this file.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseMock,
}));
vi.mock("@/lib/notifications/send", () => ({
  triggerNotification: triggerNotificationMock,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));
vi.mock("next/headers", () => ({
  headers: headersMock,
}));

// ------------------------------------------------------------
// Types + helpers
// ------------------------------------------------------------

type LeadRow = { id: string; created_at: string };

interface TableState {
  /** Rows the dedupe lookup returns for leads.select().eq().gte(). */
  existingLeads?: LeadRow[];
  /** When set, the lead insert fails with this error. */
  leadInsertError?: { message: string } | null;
  /** Staff rows returned by the profiles lookup. */
  staff?: { id: string; email: string; name: string; role: string }[];
}

interface TableCalls {
  leadInserts: Record<string, unknown>[];
  activityInserts: Record<string, unknown>[];
  dedupeFilters: { column: string; value: unknown }[];
}

/**
 * Input-based routing on the table name — never mockResolvedValueOnce
 * chains, which leak ordering assumptions between tests.
 */
function setupTables(state: TableState = {}): TableCalls {
  const calls: TableCalls = {
    leadInserts: [],
    activityInserts: [],
    dedupeFilters: [],
  };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "leads") {
      return {
        // Dedupe path: .select("id, created_at").eq("contact_email", x).gte("created_at", y)
        select: () => ({
          eq: (column: string, value: unknown) => {
            calls.dedupeFilters.push({ column, value });
            return {
              gte: () =>
                Promise.resolve({
                  data: state.existingLeads ?? [],
                  error: null,
                }),
            };
          },
        }),
        // Insert path: .insert(row).select("id").single()
        insert: (row: Record<string, unknown>) => {
          calls.leadInserts.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: state.leadInsertError ? null : { id: "lead-1" },
                  error: state.leadInsertError ?? null,
                }),
            }),
          };
        },
      };
    }

    if (table === "lead_activities") {
      return {
        insert: (row: Record<string, unknown>) => {
          calls.activityInserts.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }

    if (table === "profiles") {
      return {
        select: () => ({
          in: () => ({
            eq: () =>
              Promise.resolve({
                data: state.staff ?? [
                  { id: "u1", email: "ops@bak.com.au", name: "Ops", role: "ops" },
                ],
                error: null,
              }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return calls;
}

/** The rate-limit map is module-level — re-import to get a fresh one. */
async function loadRoute() {
  vi.resetModules();
  return await import("../route");
}

function makeRequest(
  body: unknown,
  origin = "http://localhost:3000"
): Request {
  return new Request("https://app.buildalphakids.com.au/api/crm/enquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Sets the IP that the route reads via next/headers. */
function setIp(ip: string) {
  headersMock.mockResolvedValue({
    get: (key: string) => (key === "x-forwarded-for" ? ip : null),
  });
}

const validBody = {
  centre_name: "Sunshine Early Learning",
  contact_name: "Jane Doe",
  contact_email: "jane@sunshine.com.au",
  contact_phone: "0400 000 000",
  message: "Keen to hear about your programs.",
};

beforeEach(() => {
  vi.clearAllMocks();
  setIp("1.2.3.4");
  sendEmailMock.mockResolvedValue({ success: true });
  triggerNotificationMock.mockResolvedValue(undefined);
  setupTables();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — validation", () => {
  it("returns 400 when email is missing", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest({ ...validBody, contact_email: "" }) as never);

    expect(res.status).toBe(400);
    expect(calls.leadInserts).toHaveLength(0);
  });

  it("returns 400 when centre_name is missing", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest({ ...validBody, centre_name: "  " }) as never);

    expect(res.status).toBe(400);
    expect(calls.leadInserts).toHaveLength(0);
  });
});

// ------------------------------------------------------------
// Happy path
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — happy path", () => {
  it("inserts the lead, writes an activity, notifies staff and sends the ack email", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest({
        ...validBody,
        type: "school",
        suburb: "Parramatta",
        programs_of_interest: ["Soccer", "Basketball"],
        source_page: "/programs/soccer",
      }) as never
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });

    expect(calls.leadInserts).toHaveLength(1);
    expect(calls.leadInserts[0]).toMatchObject({
      centre_name: "Sunshine Early Learning",
      type: "school",
      contact_email: "jane@sunshine.com.au",
      source: "web_form",
      stage: "cold_lead",
      suburb: "Parramatta",
      source_detail: "/programs/soccer",
    });
    // programs_of_interest is folded into notes, not its own column
    expect(String(calls.leadInserts[0].notes)).toContain("Soccer");
    expect(String(calls.leadInserts[0].notes)).toContain("Basketball");

    expect(calls.activityInserts).toHaveLength(1);
    expect(calls.activityInserts[0]).toMatchObject({ lead_id: "lead-1" });

    expect(triggerNotificationMock).toHaveBeenCalledTimes(1);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toBe("jane@sunshine.com.au");
    expect(sendEmailMock.mock.calls[0][1]).toBe(
      "Thanks for your enquiry — Build Alpha Kids"
    );
  });

  it("defaults an unknown org type to childcare_centre", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(calls.leadInserts[0]).toMatchObject({ type: "childcare_centre" });
  });
});

// ------------------------------------------------------------
// Honeypot
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — honeypot", () => {
  it("silently discards when the honeypot field is filled", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest({ ...validBody, website: "http://spam.example" }) as never
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });

    // No lead, no activity, no notification, no email.
    expect(calls.leadInserts).toHaveLength(0);
    expect(calls.activityInserts).toHaveLength(0);
    expect(triggerNotificationMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("ignores an empty honeypot field", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest({ ...validBody, website: "  " }) as never);

    expect(res.status).toBe(200);
    expect(calls.leadInserts).toHaveLength(1);
  });
});

// ------------------------------------------------------------
// "other" org type
// ------------------------------------------------------------

describe('POST /api/crm/enquiry — type: "other"', () => {
  it("maps to type: null and prefixes the notes", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(makeRequest({ ...validBody, type: "other" }) as never);

    expect(res.status).toBe(200);
    expect(calls.leadInserts).toHaveLength(1);
    expect(calls.leadInserts[0].type).toBeNull();
    expect(String(calls.leadInserts[0].notes)).toMatch(/^Org type: other\./);
    expect(String(calls.leadInserts[0].notes)).toContain(
      "Keen to hear about your programs."
    );
  });

  it("still records the org-type note when no message is supplied", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest({ ...validBody, type: "other", message: undefined }) as never
    );

    expect(res.status).toBe(200);
    expect(calls.leadInserts[0].notes).toBe("Org type: other.");
  });
});

// ------------------------------------------------------------
// Dedupe
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — dedupe", () => {
  it("skips insert/notify/email when the same email already enquired today", async () => {
    const calls = setupTables({
      existingLeads: [{ id: "existing-1", created_at: new Date().toISOString() }],
    });
    const { POST } = await loadRoute();

    const res = await POST(makeRequest(validBody) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      deduped: true,
    });

    expect(calls.leadInserts).toHaveLength(0);
    expect(calls.activityInserts).toHaveLength(0);
    expect(triggerNotificationMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();

    // Dedupe keys off the trimmed contact email.
    expect(calls.dedupeFilters).toContainEqual({
      column: "contact_email",
      value: "jane@sunshine.com.au",
    });
  });

  it("does not dedupe against a lead from a previous Sydney day", async () => {
    const calls = setupTables({
      existingLeads: [
        { id: "old-1", created_at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
      ],
    });
    const { POST } = await loadRoute();

    const res = await POST(makeRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(calls.leadInserts).toHaveLength(1);
  });
});

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — CORS", () => {
  it("returns 403 for a disallowed origin", async () => {
    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest(validBody, "https://evil.example.com") as never
    );

    expect(res.status).toBe(403);
    expect(calls.leadInserts).toHaveLength(0);
  });

  it("allows the app's own origin (NEXT_PUBLIC_SITE_URL)", async () => {
    // Not localhost: getBaseUrl()'s localhost fallback is already allowlisted
    // and would pass against the unmodified route, proving nothing.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://qa-preview.example.com");

    const calls = setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest(validBody, "https://qa-preview.example.com") as never
    );

    expect(res.status).toBe(200);
    expect(calls.leadInserts).toHaveLength(1);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://qa-preview.example.com"
    );
  });

  it("allows the active Vercel deployment origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "bak-app-abc123.vercel.app");

    setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest(validBody, "https://bak-app-abc123.vercel.app") as never
    );

    expect(res.status).toBe(200);
  });

  it("still allows the WordPress origins", async () => {
    setupTables();
    const { POST } = await loadRoute();

    const res = await POST(
      makeRequest(validBody, "https://www.buildalphakids.com.au") as never
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://www.buildalphakids.com.au"
    );
  });

  it("OPTIONS uses the same allowlist as POST", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://qa-preview.example.com");
    const { OPTIONS } = await loadRoute();

    const allowed = await OPTIONS(
      new Request("https://x/api/crm/enquiry", {
        method: "OPTIONS",
        headers: { origin: "https://qa-preview.example.com" },
      }) as never
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://qa-preview.example.com"
    );

    const denied = await OPTIONS(
      new Request("https://x/api/crm/enquiry", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example.com" },
      }) as never
    );
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

// ------------------------------------------------------------
// Rate limiting
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — rate limiting", () => {
  it("returns 429 on the 11th request from one IP", async () => {
    setupTables();
    setIp("9.9.9.9");
    const { POST } = await loadRoute();

    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest(validBody) as never);
      expect(res.status).toBe(200);
    }

    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(429);
  });

  it("tracks rate limits per IP", async () => {
    setupTables();
    setIp("8.8.8.8");
    const { POST } = await loadRoute();

    for (let i = 0; i < 11; i++) {
      await POST(makeRequest(validBody) as never);
    }

    setIp("7.7.7.7");
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(200);
  });
});

// ------------------------------------------------------------
// Ack email resilience
// ------------------------------------------------------------

describe("POST /api/crm/enquiry — ack email failures", () => {
  it("still returns 200 when the ack email reports failure", async () => {
    const calls = setupTables();
    sendEmailMock.mockResolvedValue({ success: false, error: "Resend down" });
    const { POST } = await loadRoute();

    const res = await POST(makeRequest(validBody) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(calls.leadInserts).toHaveLength(1);
  });

  it("still returns 200 when the ack email throws", async () => {
    const calls = setupTables();
    sendEmailMock.mockRejectedValue(new Error("network explode"));
    const { POST } = await loadRoute();

    const res = await POST(makeRequest(validBody) as never);

    expect(res.status).toBe(200);
    expect(calls.leadInserts).toHaveLength(1);
  });
});
