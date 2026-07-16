import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted lets us reference these mocks inside vi.mock factories
// (which are hoisted to the top of the file by Vitest).
const {
  supabaseMock,
  adminMock,
  sendEmailMock,
  parentBulkInviteMock,
  createUserMock,
  generateLinkMock,
  deleteUserMock,
  activityLogInsertMock,
  parentProfilesInsertMock,
} = vi.hoisted(() => {
  const createUserMock = vi.fn();
  const generateLinkMock = vi.fn();
  const deleteUserMock = vi.fn();
  const activityLogInsertMock = vi.fn();
  const parentProfilesInsertMock = vi.fn();
  const sendEmailMock = vi.fn();
  const parentBulkInviteMock = vi.fn(
    (data: { firstName: string; magicLinkUrl: string }) => ({
      subject: "You've been invited to Build Alpha Kids",
      html: `<p>Hi ${data.firstName}</p>`,
    })
  );

  return {
    supabaseMock: {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    },
    adminMock: {
      auth: {
        admin: {
          createUser: createUserMock,
          generateLink: generateLinkMock,
          deleteUser: deleteUserMock,
        },
      },
      from: vi.fn(),
    },
    sendEmailMock,
    parentBulkInviteMock,
    createUserMock,
    generateLinkMock,
    deleteUserMock,
    activityLogInsertMock,
    parentProfilesInsertMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
vi.mock("@/lib/launch/email", () => ({
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/launch/email-templates", async () => {
  // Keep welcomeParent intact so the parent/actions module loads OK,
  // but allow us to assert against parentBulkInvite calls.
  const actual = (await vi.importActual(
    "@/lib/launch/email-templates"
  )) as Record<string, unknown>;
  return {
    ...actual,
    parentBulkInvite: parentBulkInviteMock,
  };
});

import { importParents } from "../actions";

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

interface MockOpts {
  /** Caller's profile role. Default "admin". */
  role?: "admin" | "ops" | "coach";
  /** Existing parent_profiles.email rows for the dedup pre-check. */
  existingEmails?: string[];
}

function mockAuth(opts: MockOpts = {}) {
  const role = opts.role ?? "admin";
  const existingEmails = opts.existingEmails ?? [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "admin1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { role }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unmocked supabase.from(${table})`);
  });

  adminMock.from.mockImplementation((table: string) => {
    if (table === "parent_profiles") {
      return {
        // Bulk dedup pre-check: select("email").in("email", [...])
        select: () => ({
          in: () =>
            Promise.resolve({
              data: existingEmails.map((email) => ({ email })),
              error: null,
            }),
        }),
        insert: (row: unknown) => {
          parentProfilesInsertMock(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: unknown) => {
          activityLogInsertMock(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unmocked admin.from(${table})`);
  });

  // Default happy paths for auth.admin
  createUserMock.mockImplementation(({ email }: { email: string }) =>
    Promise.resolve({
      data: { user: { id: `auth-${email}` } },
      error: null,
    })
  );
  generateLinkMock.mockResolvedValue({
    data: { properties: { action_link: "https://magic.example/abc" } },
    error: null,
  });
  deleteUserMock.mockResolvedValue({ data: null, error: null });
  sendEmailMock.mockResolvedValue({ success: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------
// Tests
// ----------------------------------------------------------

describe("importParents — auth gating", () => {
  it("rejects unauthenticated callers", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await importParents([
      { first_name: "Jane", email: "jane@example.com" },
    ]);
    expect(result.error).toMatch(/not authenticated/i);
    expect(createUserMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("rejects coach-role callers", async () => {
    mockAuth({ role: "coach" });
    const result = await importParents([
      { first_name: "Jane", email: "jane@example.com" },
    ]);
    expect(result.error).toMatch(/admin or ops/i);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("allows ops-role callers", async () => {
    mockAuth({ role: "ops" });
    const result = await importParents([
      { first_name: "Jane", email: "jane@example.com" },
    ]);
    expect(result.error).toBeNull();
    expect(result.data.created).toBe(1);
  });
});

describe("importParents — input handling", () => {
  it("returns an error for empty input", async () => {
    mockAuth();
    const result = await importParents([]);
    expect(result.error).toMatch(/no rows/i);
    expect(result.data.created).toBe(0);
  });

  it("flags missing first_name without sending email", async () => {
    mockAuth();
    const result = await importParents([
      { first_name: "", email: "no-name@example.com" },
    ]);
    expect(result.data.created).toBe(0);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0].message).toMatch(/first name/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("flags missing email", async () => {
    mockAuth();
    const result = await importParents([
      { first_name: "Jane", email: "" },
    ]);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0].message).toMatch(/missing email/i);
  });

  it("flags invalid email format", async () => {
    mockAuth();
    const result = await importParents([
      { first_name: "Jane", email: "not-an-email" },
    ]);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0].message).toMatch(/invalid email/i);
    expect(createUserMock).not.toHaveBeenCalled();
  });
});

describe("importParents — duplicate detection", () => {
  it("skips parents whose email already exists in parent_profiles (case-insensitive)", async () => {
    mockAuth({ existingEmails: ["existing@example.com"] });

    const result = await importParents([
      { first_name: "Existing", email: "EXISTING@example.com" },
      { first_name: "Fresh", email: "fresh@example.com" },
    ]);

    expect(result.data.created).toBe(1);
    expect(result.data.skipped).toBe(1);
    expect(result.data.errors).toHaveLength(0);
    expect(createUserMock).toHaveBeenCalledTimes(1);
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "fresh@example.com" })
    );
  });

  it("does not skip duplicates when skipDuplicates=false", async () => {
    mockAuth({ existingEmails: ["dup@example.com"] });
    // With skipDuplicates=false, the dedup pre-check is bypassed and
    // Supabase's createUser is hit. If it returns "already registered"
    // we surface it as an error.
    createUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "User already registered" },
    });

    const result = await importParents(
      [{ first_name: "Dup", email: "dup@example.com" }],
      { skipDuplicates: false }
    );

    expect(result.data.skipped).toBe(0);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0].message).toMatch(/already exists/i);
  });
});

describe("importParents — happy path", () => {
  it("invites two new parents end-to-end: auth user, profile, email, activity log", async () => {
    mockAuth();

    const result = await importParents([
      { first_name: "Jane", last_name: "Smith", email: "jane@example.com" },
      {
        first_name: "Bob",
        last_name: "Jones",
        email: "bob@example.com",
        phone: "0412345678",
      },
    ]);

    expect(result.error).toBeNull();
    expect(result.data.created).toBe(2);
    expect(result.data.skipped).toBe(0);
    expect(result.data.errors).toHaveLength(0);

    // Auth users created for both
    expect(createUserMock).toHaveBeenCalledTimes(2);
    // parent_profiles inserts for both, lowercased emails
    expect(parentProfilesInsertMock).toHaveBeenCalledTimes(2);
    expect(parentProfilesInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        first_name: "Jane",
        last_name: "Smith",
      })
    );
    expect(parentProfilesInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "bob@example.com",
        phone: "0412345678",
      })
    );

    // Magic links generated for both
    expect(generateLinkMock).toHaveBeenCalledTimes(2);

    // Resend called twice with the parent_bulk_invite type
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        emailType: "parent_bulk_invite",
      })
    );

    // Template received the generated magic link
    expect(parentBulkInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Jane",
        magicLinkUrl: "https://magic.example/abc",
      })
    );

    // Activity log: one row per invite
    expect(activityLogInsertMock).toHaveBeenCalledTimes(2);
    expect(activityLogInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "parent_invited_via_bulk",
        entity_type: "parent_profile",
        user_id: "admin1",
      })
    );
  });
});

describe("importParents — invite links target the marketing origin", () => {
  // Audience principle: the invitee is a PARENT, so once the public site
  // is live the link must go to buildalphakids.com.au even though STAFF
  // trigger this from the app domain — otherwise the parent's session
  // lands in the .app cookie jar and they'd log in a second time when
  // they first browse the site.
  //
  // But "once the public site is live" is doing real work in that
  // sentence. This is a magic link that a parent CLICKS, so it is gated
  // on NEXT_PUBLIC_MARKETING_URL rather than hardcoding the destination:
  // .com.au serves WordPress until the DNS cutover, and Supabase
  // silently swaps a non-allowlisted emailRedirectTo for its own Site
  // URL instead of erroring — so getting this wrong fails invisibly, in
  // a flow whose failure nobody sees until a parent complains.
  //
  // The two tests below pin BOTH sides of that flip.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("targets the app domain pre-cutover, when NEXT_PUBLIC_MARKETING_URL is unset", async () => {
    // Merged and deployed, DNS not yet moved (after runbook step 6,
    // before step 7). The link must name a host that serves this app
    // TODAY. This is exactly main's behaviour, preserved.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://buildalphakids.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "");
    mockAuth();

    await importParents([
      { first_name: "Jane", last_name: "Smith", email: "jane@example.com" },
    ]);

    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "magiclink",
        email: "jane@example.com",
        options: {
          redirectTo:
            "https://buildalphakids.app/auth/callback?next=%2Fparent-login",
        },
      })
    );
  });

  it("moves to the .com.au callback once the cutover env is set", async () => {
    // Runbook step 8 — the post-DNS flip that realises the audience
    // principle.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://buildalphakids.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://buildalphakids.com.au");
    mockAuth();

    await importParents([
      { first_name: "Jane", last_name: "Smith", email: "jane@example.com" },
    ]);

    const redirectTo = generateLinkMock.mock.calls[0][0].options.redirectTo;
    expect(redirectTo).toBe(
      "https://buildalphakids.com.au/auth/callback?next=%2Fparent-login"
    );
    expect(redirectTo).not.toContain("buildalphakids.app");
  });

  it("is deterministic — honours NEXT_PUBLIC_MARKETING_URL, never the app domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://buildalphakids.app");
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://staging.example.com");
    mockAuth();

    await importParents([
      { first_name: "Jane", last_name: "Smith", email: "jane@example.com" },
    ]);

    const redirectTo = generateLinkMock.mock.calls[0][0].options.redirectTo;
    expect(redirectTo).toBe(
      "https://staging.example.com/auth/callback?next=%2Fparent-login"
    );
    expect(redirectTo).not.toContain("buildalphakids.app");
  });
});

describe("importParents — resilience", () => {
  it("continues the batch when Resend fails for one row", async () => {
    mockAuth();

    // First send succeeds, second fails. Use mockImplementation by call
    // order rather than mockResolvedValueOnce (the codebase prefers
    // input-based routing, but here we want deterministic ordering).
    let callIdx = 0;
    sendEmailMock.mockImplementation(() => {
      callIdx++;
      if (callIdx === 2) {
        return Promise.resolve({
          success: false,
          error: "Resend 500: temporary failure",
        });
      }
      return Promise.resolve({ success: true });
    });

    const result = await importParents([
      { first_name: "Jane", email: "jane@example.com" },
      { first_name: "Bob", email: "bob@example.com" },
    ]);

    // Both auth users + profiles still landed.
    expect(createUserMock).toHaveBeenCalledTimes(2);
    expect(parentProfilesInsertMock).toHaveBeenCalledTimes(2);

    // Created counter still reflects both inserts; error list flags
    // the failed dispatch so operators can investigate.
    expect(result.data.created).toBe(2);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0].email).toBe("bob@example.com");
    expect(result.data.errors[0].message).toMatch(/Resend|temporary/i);

    // Activity log still recorded both rows (email_sent flag captures
    // the per-row delivery state).
    expect(activityLogInsertMock).toHaveBeenCalledTimes(2);
  });

  it("rolls back the auth user when parent_profiles insert fails", async () => {
    mockAuth();
    adminMock.from.mockImplementation((table: string) => {
      if (table === "parent_profiles") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: () =>
            Promise.resolve({
              error: { message: "duplicate key value violates unique constraint" },
            }),
        };
      }
      if (table === "activity_log") {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }
      throw new Error(`unmocked admin.from(${table})`);
    });

    const result = await importParents([
      { first_name: "Jane", email: "jane@example.com" },
    ]);

    expect(result.data.created).toBe(0);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0].message).toMatch(/duplicate key/);
    expect(deleteUserMock).toHaveBeenCalledWith("auth-jane@example.com");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
