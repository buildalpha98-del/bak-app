import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted so these references exist before the hoisted vi.mock factories run.
const { supabaseMock, headersMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  headersMock: vi.fn(),
}));

// Overrides the global admin mock in tests/setup.ts for this file.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseMock,
}));
vi.mock("next/headers", () => ({
  headers: headersMock,
}));

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

interface UpsertCall {
  row: Record<string, unknown>;
  options: Record<string, unknown> | undefined;
}

/**
 * Input-based routing on the table name — never mockResolvedValueOnce
 * chains, which leak ordering assumptions between tests. An unexpected
 * table throws rather than returning a silent undefined.
 */
function setupTables(state: { upsertError?: { message: string } } = {}): UpsertCall[] {
  const upserts: UpsertCall[] = [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "newsletter_subscribers") {
      return {
        upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
          upserts.push({ row, options });
          return Promise.resolve({ error: state.upsertError ?? null });
        },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return upserts;
}

function setIp(ip: string | null) {
  headersMock.mockResolvedValue({
    get: (name: string) => (name === "x-forwarded-for" ? ip : null),
  });
}

/**
 * The rate limiter is a module-level Map, so every test needs a fresh
 * copy of the module or the counts bleed across cases (and the order
 * of the file starts deciding whether it passes).
 */
async function loadAction() {
  vi.resetModules();
  const mod = await import("../newsletter");
  return mod.subscribeToNewsletter;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  setIp("203.0.113.1");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

describe("subscribeToNewsletter — validation", () => {
  it("rejects an empty email without touching the database", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    expect(await subscribe(form({ email: "" }))).toEqual({
      ok: false,
      code: "email_required",
    });
    expect(upserts).toHaveLength(0);
  });

  it("rejects whitespace-only as required, not invalid", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    expect(await subscribe(form({ email: "   " }))).toEqual({
      ok: false,
      code: "email_required",
    });
    expect(upserts).toHaveLength(0);
  });

  it("rejects a missing email field entirely", async () => {
    setupTables();
    const subscribe = await loadAction();

    expect(await subscribe(form({}))).toEqual({ ok: false, code: "email_required" });
  });

  it("rejects an address with no @ or no dot", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    for (const bad of ["nope", "no-at-sign.com", "no@dot", "two @spaces.com"]) {
      expect(await subscribe(form({ email: bad }))).toEqual({
        ok: false,
        code: "email_invalid",
      });
    }
    expect(upserts).toHaveLength(0);
  });

  it("rejects an address longer than SMTP allows", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    const tooLong = `${"a".repeat(250)}@example.com`;
    expect(await subscribe(form({ email: tooLong }))).toEqual({
      ok: false,
      code: "email_invalid",
    });
    expect(upserts).toHaveLength(0);
  });

  it("accepts a plain valid address", async () => {
    setupTables();
    const subscribe = await loadAction();

    expect(await subscribe(form({ email: "parent@example.com" }))).toEqual({ ok: true });
  });
});

// ------------------------------------------------------------
// Normalisation
// ------------------------------------------------------------

describe("subscribeToNewsletter — normalisation", () => {
  it("lowercases the address before storing it (the UNIQUE index depends on this)", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "Parent@Example.COM" }));

    expect(upserts[0].row.email).toBe("parent@example.com");
  });

  it("trims surrounding whitespace", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "  parent@example.com \n" }));

    expect(upserts[0].row.email).toBe("parent@example.com");
  });

  it("trims and lowercases together", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "  PARENT@Example.com  " }));

    expect(upserts[0].row.email).toBe("parent@example.com");
  });

  it("records a same-site source_page", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "parent@example.com", source_page: "/" }));

    expect(upserts[0].row.source_page).toBe("/");
  });

  it("discards a source_page that is not a path (it is caller-controlled)", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(
      form({ email: "parent@example.com", source_page: "https://evil.example/x" })
    );

    expect(upserts[0].row.source_page).toBeNull();
  });

  it("stores a null source_page when the field is absent", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "parent@example.com" }));

    expect(upserts[0].row.source_page).toBeNull();
  });
});

// ------------------------------------------------------------
// Honeypot
// ------------------------------------------------------------

describe("subscribeToNewsletter — honeypot", () => {
  it("short-circuits to success with no insert when filled", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    const result = await subscribe(
      form({ email: "bot@example.com", website: "http://spam.example" })
    );

    // Success so the bot has no signal to retry against — and nothing recorded.
    expect(result).toEqual({ ok: true });
    expect(upserts).toHaveLength(0);
  });

  it("does not short-circuit on an empty or whitespace honeypot", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "parent@example.com", website: "  " }));

    expect(upserts).toHaveLength(1);
  });

  it("short-circuits before the email is even validated", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    expect(await subscribe(form({ email: "junk", website: "x" }))).toEqual({ ok: true });
    expect(upserts).toHaveLength(0);
  });
});

// ------------------------------------------------------------
// Upsert
// ------------------------------------------------------------

describe("subscribeToNewsletter — upsert", () => {
  it("upserts on email so a resubscribe flips status back rather than colliding", async () => {
    const upserts = setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "parent@example.com", source_page: "/" }));

    expect(upserts).toHaveLength(1);
    expect(upserts[0].row).toEqual({
      email: "parent@example.com",
      status: "subscribed",
      source_page: "/",
    });
    expect(upserts[0].options).toEqual({ onConflict: "email" });
  });

  it("writes to newsletter_subscribers", async () => {
    setupTables();
    const subscribe = await loadAction();

    await subscribe(form({ email: "parent@example.com" }));

    expect(supabaseMock.from).toHaveBeenCalledWith("newsletter_subscribers");
  });

  it("returns the failure code when the write errors, and never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setupTables({ upsertError: { message: "relation does not exist" } });
    const subscribe = await loadAction();

    expect(await subscribe(form({ email: "parent@example.com" }))).toEqual({
      ok: false,
      code: "failed",
    });
  });

  it("swallows an unexpected throw into the failure code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const subscribe = await loadAction();

    // A thrown server action reaches the client as an opaque digest —
    // the form must get a code it can render instead.
    expect(await subscribe(form({ email: "parent@example.com" }))).toEqual({
      ok: false,
      code: "failed",
    });
  });
});

// ------------------------------------------------------------
// Rate limiting
// ------------------------------------------------------------

describe("subscribeToNewsletter — rate limiting", () => {
  it("allows ten attempts per IP and blocks the eleventh", async () => {
    setupTables();
    const subscribe = await loadAction();

    for (let i = 0; i < 10; i++) {
      expect(await subscribe(form({ email: `p${i}@example.com` }))).toEqual({ ok: true });
    }

    expect(await subscribe(form({ email: "p10@example.com" }))).toEqual({
      ok: false,
      code: "rate_limited",
    });
  });

  it("counts per IP, so one spammer cannot lock out everyone else", async () => {
    setupTables();
    const subscribe = await loadAction();

    setIp("203.0.113.1");
    for (let i = 0; i < 11; i++) await subscribe(form({ email: `p${i}@example.com` }));

    setIp("203.0.113.9");
    expect(await subscribe(form({ email: "other@example.com" }))).toEqual({ ok: true });
  });

  it("uses the first x-forwarded-for hop, not the whole chain", async () => {
    setupTables();
    const subscribe = await loadAction();

    // The proxy chain header — the client is the first entry.
    headersMock.mockResolvedValue({
      get: (name: string) =>
        name === "x-forwarded-for" ? "203.0.113.1, 70.41.3.18, 150.172.238.178" : null,
    });
    for (let i = 0; i < 11; i++) await subscribe(form({ email: `p${i}@example.com` }));

    setIp("203.0.113.1");
    // Same client, chain stripped — must land in the same bucket.
    expect(await subscribe(form({ email: "again@example.com" }))).toEqual({
      ok: false,
      code: "rate_limited",
    });
  });

  it("buckets callers with no resolvable IP together rather than exempting them", async () => {
    setupTables();
    const subscribe = await loadAction();

    setIp(null);
    for (let i = 0; i < 10; i++) await subscribe(form({ email: `p${i}@example.com` }));

    expect(await subscribe(form({ email: "p10@example.com" }))).toEqual({
      ok: false,
      code: "rate_limited",
    });
  });

  it("does not spend a token on a bot that trips the honeypot", async () => {
    setupTables();
    const subscribe = await loadAction();

    for (let i = 0; i < 11; i++) {
      await subscribe(form({ email: `bot${i}@example.com`, website: "spam" }));
    }

    // A real subscriber behind the same NAT still gets their allowance.
    expect(await subscribe(form({ email: "parent@example.com" }))).toEqual({ ok: true });
  });

  it("starts a fresh window once the previous one expires", async () => {
    vi.useFakeTimers();
    setupTables();
    const subscribe = await loadAction();

    for (let i = 0; i < 11; i++) await subscribe(form({ email: `p${i}@example.com` }));
    expect(await subscribe(form({ email: "blocked@example.com" }))).toEqual({
      ok: false,
      code: "rate_limited",
    });

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(await subscribe(form({ email: "later@example.com" }))).toEqual({ ok: true });
    vi.useRealTimers();
  });

  it("keeps the module-level counter isolated between test loads", async () => {
    setupTables();
    // A second load must start from zero — if this fails, the resetModules
    // in loadAction() has stopped working and every count above is a lie.
    const subscribe = await loadAction();

    expect(await subscribe(form({ email: "fresh@example.com" }))).toEqual({ ok: true });
  });
});
