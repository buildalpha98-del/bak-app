import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), single: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }) }) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
import { requireAdmin, requireStaff, AuthorisationError } from "../require-role";
import { requireCronAuth } from "@/lib/utils/apiProtection";
import { limitAuthEmail } from "../request-limit";
import { staffUpdateSchema, centreUpdateSchema, termUpdateSchema, payRateSchema } from "../action-schemas";
import { requireApiRole } from "../api-role";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "actor", email: "staff@example.com" } }, error: null });
  mocks.single.mockResolvedValue({ data: { role: "admin", status: "active" }, error: null });
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "192.0.2.19" }));
});
afterEach(() => vi.unstubAllEnvs());
describe("Phase 1 authorisation", () => {
  it.each(["coach", "parent", "client", "ops"])("refuses %s admin mutations", async role => {
    mocks.single.mockResolvedValue({ data: { role, status: "active" }, error: null });
    await expect(requireAdmin()).rejects.toBeInstanceOf(AuthorisationError);
  });
  it("refuses anonymous, inactive, missing and failed profile reads", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
    for (const result of [{ data: null, error: null }, { data: { role: "admin", status: "inactive" }, error: null }, { data: { role: "admin", status: "active" }, error: { message: "offline" } }]) {
      mocks.single.mockResolvedValue(result);
      await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
    }
  });
  it("accepts active operational staff and rejects demo identities even with a staff profile", async () => {
    await expect(requireAdmin()).resolves.toHaveProperty("user.id", "actor");
    mocks.single.mockResolvedValue({ data: { role: "ops", status: "active" }, error: null });
    await expect(requireStaff()).resolves.toHaveProperty("user.id", "actor");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "demo", email: "demo-viewer@buildalphakids.app" } } });
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
  });
  it("allows the assistant only for the shared coaching pool", async () => {
    expect((await requireApiRole(true))?.status).toBe(403);
    for (const profile of [{ role: "coach" }, { role: "ops", also_coaches: true }]) {
      mocks.single.mockResolvedValue({ data: { ...profile, status: "active" }, error: null });
      expect(await requireApiRole(true)).toBeNull();
    }
  });
  it("fails closed on missing cron secret, forged Bearer undefined and wrong tokens", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(requireCronAuth(new Request("https://example.com", { headers: { authorization: "Bearer undefined" } }))?.status).toBe(401);
    vi.stubEnv("CRON_SECRET", "test-secret");
    expect(requireCronAuth(new Request("https://example.com", { headers: { authorization: "Bearer wrong" } }))?.status).toBe(401);
    expect(requireCronAuth(new Request("https://example.com", { headers: { authorization: "Bearer test-secret" } }))).toBeNull();
  });
  it("rejects extra privilege fields and invalid action values", () => {
    expect(staffUpdateSchema.safeParse({ financial_access: true }).success).toBe(false);
    expect(centreUpdateSchema.safeParse({ id: "other-centre" }).success).toBe(false);
    expect(termUpdateSchema.safeParse({ status: "paid" }).success).toBe(false);
    expect(payRateSchema.safeParse({ rate: -1 }).success).toBe(false);
  });
  it("normalises email cooldowns and limits IPs across different emails", async () => {
    expect(await limitAuthEmail("audit@example.com")).toBeNull();
    expect(await limitAuthEmail("AUDIT@example.com")).toContain("wait");
    for (let i = 0; i < 8; i++) expect(await limitAuthEmail(`audit${i}@example.com`)).toBeNull();
    expect(await limitAuthEmail("another@example.com")).toContain("wait");
  });
});
