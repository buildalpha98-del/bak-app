import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub Next.js `server-only` guard so the SUT can be imported under Node test runner.
vi.mock("server-only", () => ({}));

// Mock Supabase client BEFORE importing the SUT
const supabaseMock = {
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

// SUT
import { setSessionCoaches } from "../session-coaches";

beforeEach(() => {
  supabaseMock.rpc.mockReset();
});

describe("setSessionCoaches", () => {
  it("rejects an input set with no primary when at least one coach is provided", async () => {
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: false },
        { userId: "u2", isPrimary: false },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toMatch(/exactly one primary/i);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("rejects an input set with more than one primary", async () => {
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: true },
        { userId: "u2", isPrimary: true },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toMatch(/exactly one primary/i);
  });

  it("rejects duplicate userIds in the input", async () => {
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: true },
        { userId: "u1", isPrimary: false },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toMatch(/duplicate/i);
  });

  it("allows an empty array (zero-coach state — trigger handles status flip)", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [],
      assignedBy: "ops1",
    });
    expect(result.error).toBeNull();
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "set_session_coaches",
      expect.objectContaining({
        p_session_id: "s1",
        p_coaches: [],
        p_assigned_by: "ops1",
      })
    );
  });

  it("passes a single-primary set through to the RPC", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: true },
        { userId: "u2", isPrimary: false },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toBeNull();
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "set_session_coaches",
      expect.objectContaining({
        p_session_id: "s1",
        p_coaches: [
          { user_id: "u1", is_primary: true },
          { user_id: "u2", is_primary: false },
        ],
        p_assigned_by: "ops1",
      })
    );
  });

  it("propagates an RPC error verbatim", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [{ userId: "u1", isPrimary: true }],
      assignedBy: "ops1",
    });
    expect(result.error).toBe("permission denied");
  });
});
