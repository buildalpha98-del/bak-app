import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mockSupabaseClient } from "@/tests/setup";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { completionMinutes, transitionCoachSession } from "@/lib/sessions/coach-lifecycle";
import { updateCoachDefaultRate, upsertCoachSessionRate, deleteCoachSessionRate, setSessionRateOverride, removeSessionRateOverride } from "@/lib/pay-rates/actions";
import { updateSession, updateSessionStatus, bulkUpdateSessionStatus } from "@/lib/sessions/actions";

const id = "00000000-0000-4000-8000-000000000001";
let role: string;
let session: Record<string, unknown>;
let member: boolean;
let membershipError: Error | null;
let readError: Error | null;
let db: ReturnType<typeof mockSupabaseClient>;
let admin: ReturnType<typeof mockSupabaseClient>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T00:00:00Z")); // Sydney 11am
  role = "coach"; member = true; membershipError = null; readError = null;
  session = { id, coach_id: "coach", status: "confirmed", date: "2026-10-26", time: "11:00:00", duration_minutes: 45, started_at: null, updated_at: "2026-10-25T00:00:00Z" };
  db = mockSupabaseClient(); admin = mockSupabaseClient();
  db.auth.getUser.mockResolvedValue({ data: { user: { id: "coach", email: "coach@example.com" } as never }, error: null });
  db.from.mockImplementation((table: string) => {
    const query = mockSupabaseClient()._builder;
    query.then = (resolve: (value: unknown) => unknown) => resolve({
      data: table === "profiles" ? { role, status: "active" } : table === "sessions" ? session : member ? { user_id: "coach" } : null,
      error: table === "session_coaches" ? membershipError : table === "sessions" ? readError : null,
    });
    return query;
  });
  (admin._builder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id }, error: null });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db as never);
  vi.mocked(createSupabaseAdmin).mockReturnValue(admin as never);
});
afterEach(() => vi.useRealTimers());

describe("coach pay boundary", () => {
  it("refuses coach rate, override and generic status mutations before privileged access", async () => {
    const calls = [
      () => updateCoachDefaultRate(999),
      () => upsertCoachSessionRate({} as never),
      () => deleteCoachSessionRate(id),
      () => setSessionRateOverride({ sessionId: id, rate: 999, reason: "probe" }),
      () => removeSessionRateOverride(id),
      () => updateSession(id, {}),
      () => updateSessionStatus(id, "completed"),
      () => bulkUpdateSessionStatus([id], "completed"),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow("Not authorised.");
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("caps reported overtime at rostered pay until staff approval", () => {
    expect(completionMinutes("2026-10-25T22:00:00Z", 45, Date.now())).toEqual({ reportedMinutes: 120, payableMinutes: 45, needsReview: true });
  });
  it("does not manufacture worked time when a legacy completion has no timer", () => {
    expect(completionMinutes(null, 45, Date.now())).toEqual({ reportedMinutes: null, payableMinutes: null, needsReview: true });
    expect(() => completionMinutes("invalid", 45, Date.now())).toThrow();
    expect(() => completionMinutes("2026-10-27T00:00:00Z", 45, Date.now())).toThrow();
  });
});

describe("narrow coach lifecycle writer", () => {
  it("permits an assigned second coach to start at Sydney time with a server timestamp", async () => {
    session.coach_id = "lead";
    expect(await transitionCoachSession(id, "start")).toMatchObject({ error: null, changed: true });
    expect(admin._builder.update).toHaveBeenCalledWith({ status: "in_progress", started_at: "2026-10-26T00:00:00.000Z" });
    expect(admin._builder.eq).toHaveBeenCalledWith("updated_at", session.updated_at);
    expect(admin._builder.eq).toHaveBeenCalledWith("status", "confirmed");
  });
  it("allows lead confirmation but refuses second-coach confirmation", async () => {
    session.status = "pending_confirmation";
    session.coach_id = "lead";
    expect((await transitionCoachSession(id, "confirm")).error).toMatch(/lead/);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
    session.coach_id = "coach";
    expect((await transitionCoachSession(id, "confirm")).error).toBeNull();
  });
  it("rejects a bystander and a portal principal before service access", async () => {
    member = false;
    expect((await transitionCoachSession(id, "start")).error).toBe("Not your session.");
    role = "parent";
    await expect(transitionCoachSession(id, "start")).rejects.toThrow("Not authorised.");
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("fails closed on session and membership query errors", async () => {
    readError = new Error("session unavailable");
    await expect(transitionCoachSession(id, "start")).rejects.toThrow("session unavailable");
    readError = null; membershipError = new Error("membership unavailable");
    await expect(transitionCoachSession(id, "start")).rejects.toThrow("membership unavailable");
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("refuses an early start and a completion before the scheduled end without a timer", async () => {
    session.time = "12:00:00";
    expect((await transitionCoachSession(id, "start")).error).toMatch(/30 minutes/);
    expect((await transitionCoachSession(id, "complete")).error).toMatch(/scheduled end/);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
  it("records overtime separately from payable time and queues review", async () => {
    session.status = "in_progress"; session.started_at = "2026-10-25T22:00:00Z";
    expect((await transitionCoachSession(id, "complete", 12)).error).toBeNull();
    expect(admin._builder.update).toHaveBeenCalledWith(expect.objectContaining({ actual_duration_minutes: 45, reported_duration_minutes: 120, needs_ops_review: true, headcount: 12 }));
  });
  it("does not overwrite a row changed since the authorisation check", async () => {
    (admin._builder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    expect((await transitionCoachSession(id, "start")).error).toMatch(/Session changed/);
  });
  it("does not silently treat a failed write as success", async () => {
    (admin._builder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: new Error("write denied") });
    await expect(transitionCoachSession(id, "start")).rejects.toThrow("write denied");
  });
  it("does not change approved duration on a second completion", async () => {
    session.status = "completed";
    expect(await transitionCoachSession(id, "complete", 99)).toEqual({ error: null, changed: false });
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });
});
