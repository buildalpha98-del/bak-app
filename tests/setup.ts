import { vi } from "vitest";

// ============================================================
// Mock Supabase client factory
// ============================================================

/**
 * Creates a mock Supabase client that supports full query chaining.
 * Every chained method returns the same builder so you can do:
 *   client.from("table").select("*").eq("id", "x").single()
 * and it resolves to { data: null, error: null } by default.
 */
export function mockSupabaseClient() {
  const defaultResponse = { data: null, error: null, count: null };

  const builder: Record<string, unknown> = {};

  const chainMethods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "in",
    "not",
    "or",
    "filter",
    "match",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
    "csv",
    "returns",
    "textSearch",
    "contains",
    "containedBy",
    "overlaps",
    "head",
  ];

  // Each chain method returns the builder itself (thenable)
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Make the builder thenable so `await` resolves to default response
  builder.then = vi.fn((resolve: (value: unknown) => void) =>
    resolve(defaultResponse)
  );

  // from() returns the builder
  const from = vi.fn().mockReturnValue(builder);

  // rpc() returns a promise-like builder too
  const rpc = vi.fn().mockResolvedValue(defaultResponse);

  // auth methods
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    signInWithOtp: vi.fn().mockResolvedValue({ data: null, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    admin: {
      listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      deleteUser: vi.fn().mockResolvedValue({ data: null, error: null }),
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };

  // storage methods
  const storage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      download: vi.fn().mockResolvedValue({ data: null, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "" } }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };

  return {
    from,
    rpc,
    auth,
    storage,
    // Expose builder for test assertions
    _builder: builder,
  };
}

// ============================================================
// Module mocks
// ============================================================

const serverClient = mockSupabaseClient();
const adminClient = mockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => serverClient),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => adminClient),
}));

// Export for use in tests
export { serverClient, adminClient };
