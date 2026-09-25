import { test, expect } from "@playwright/test";
import { adminClient } from "./fixtures/auth";

// ============================================================
// sessions.term_id follows the date (migration 100)
// ============================================================
//
// A session used to carry whichever term was current when it was typed
// in — Term 3's roster was labelled Term 1 and every read keyed by
// term_id (term report, portal session list, coach term stats, public
// stats) was wrong for it. Two throwaway terms in 2031, one throwaway
// centre; the session is inserted with the WRONG term and must come back
// with the right one, and re-label itself when its date moves. Deleted
// in afterAll (deleting the terms cascades the session).

const RUN = `e2e-${Date.now().toString(36)}`;
let fx: { termA: string; termB: string; centreId: string } | null = null;
let skipReason: string | null = null;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data: a } = await admin.from("terms").insert({ name: `E2E Term A ${RUN}`, start_date: "2031-05-05", end_date: "2031-05-09", year: 2031, status: "draft" }).select("id").single();
  const { data: b } = await admin.from("terms").insert({ name: `E2E Term B ${RUN}`, start_date: "2031-06-02", end_date: "2031-06-06", year: 2031, status: "draft" }).select("id").single();
  const { data: centre } = await admin.from("centres").insert({ name: `E2E Centre ${RUN}`, type: "childcare_centre" }).select("id").single();
  if (!a || !b || !centre) {
    skipReason = "Could not create the terms or centre.";
    return;
  }
  fx = { termA: a.id, termB: b.id, centreId: centre.id };
});

test.afterAll(async () => {
  if (!fx) return;
  const admin = adminClient();
  await admin.from("terms").delete().in("id", [fx.termA, fx.termB]);
  await admin.from("centres").delete().eq("id", fx.centreId);
});

test.describe("a session's term follows its date", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("inserted under the wrong term, it lands in the term its date belongs to; moving the date moves the term", async () => {
    const admin = adminClient();
    const { data: s, error } = await admin
      .from("sessions")
      .insert({ term_id: fx!.termA, centre_id: fx!.centreId, date: "2031-06-03", time: "10:00:00", duration_minutes: 45, sport: "Soccer", status: "draft", needs_ops_review: false })
      .select("id, term_id")
      .single();
    expect(error).toBeNull();
    expect(s!.term_id, "labelled by date, not by what was passed").toBe(fx!.termB);

    const { data: moved } = await admin.from("sessions").update({ date: "2031-05-07" }).eq("id", s!.id).select("term_id").single();
    expect(moved!.term_id).toBe(fx!.termA);

    // A date inside no term keeps the term it has — holiday drafts are deliberate.
    const { data: holiday } = await admin.from("sessions").update({ date: "2031-05-20" }).eq("id", s!.id).select("term_id").single();
    expect(holiday!.term_id).toBe(fx!.termA);
  });
});
