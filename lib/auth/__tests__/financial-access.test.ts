import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// The function under test calls Next's `redirect()` which throws an
// internal Next error to halt rendering — we mock it to capture the
// destination URL synchronously without leaking the throw.
const { redirectMock, supabaseMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // Mimic Next's behaviour: throw a sentinel error so the caller
    // exits early. The test inspects redirectMock.mock.calls for the
    // destination, not the thrown value.
    throw new Error(`__REDIRECT__:${url}`);
  }),
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { requireFinancialAccess } from "../financial-access";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockProfile(
  profile: { role: string; financial_access: boolean } | null,
) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "profiles") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: profile, error: null }),
        }),
      }),
    };
  });
}

describe("requireFinancialAccess", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireFinancialAccess()).rejects.toThrow(/__REDIRECT__:\/login/);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the profile row is missing", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "ghost" } },
    });
    mockProfile(null);

    await expect(requireFinancialAccess()).rejects.toThrow(/__REDIRECT__:\/login/);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("does NOT redirect when financial_access is true (admin)", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });
    mockProfile({ role: "admin", financial_access: true });

    await expect(requireFinancialAccess()).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect when financial_access is true (ops with grant)", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "ops-1" } },
    });
    mockProfile({ role: "ops", financial_access: true });

    await expect(requireFinancialAccess()).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects ops with financial_access=false to /ops?denied=financial", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "ops-2" } },
    });
    mockProfile({ role: "ops", financial_access: false });

    await expect(requireFinancialAccess()).rejects.toThrow(
      /__REDIRECT__:\/ops\?denied=financial/,
    );
    expect(redirectMock).toHaveBeenCalledWith("/ops?denied=financial");
  });

  it("redirects coach with financial_access=false to /coach?denied=financial", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "coach-1" } },
    });
    mockProfile({ role: "coach", financial_access: false });

    await expect(requireFinancialAccess()).rejects.toThrow(
      /__REDIRECT__:\/coach\?denied=financial/,
    );
    expect(redirectMock).toHaveBeenCalledWith("/coach?denied=financial");
  });

  it("redirects admin with financial_access=false to /admin?denied=financial (defensive)", async () => {
    // Edge case — admins default to financial_access=true (migration
    // 050), but if an admin's flag was manually flipped off, the gate
    // still kicks them out cleanly rather than silently allowing.
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-2" } },
    });
    mockProfile({ role: "admin", financial_access: false });

    await expect(requireFinancialAccess()).rejects.toThrow(
      /__REDIRECT__:\/admin\?denied=financial/,
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin?denied=financial");
  });
});
