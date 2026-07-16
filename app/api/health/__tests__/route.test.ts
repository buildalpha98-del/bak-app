import { describe, it, expect, vi, beforeEach } from "vitest";

const { headMock } = vi.hoisted(() => ({ headMock: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ limit: () => headMock() }),
    }),
  }),
}));

import { GET } from "../route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/health", () => {
  it("returns 200 when the database answers", async () => {
    headMock.mockResolvedValue({ error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  // The whole point: a DB the app can't reach must surface as a non-200
  // an uptime monitor can alert on — not a hung 200.
  it("returns 503 when the query errors", async () => {
    headMock.mockResolvedValue({ error: { message: "connection refused" } });
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).db).toBe("unreachable");
  });

  it("returns 503 when the client throws outright", async () => {
    headMock.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(503);
  });
});
