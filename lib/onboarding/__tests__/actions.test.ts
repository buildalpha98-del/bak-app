import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted ensures these references exist before vi.mock factories run
// (vi.mock is hoisted to the top of the file by Vitest).
const { supabaseMock, revalidatePathMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import {
  startCentreOnboarding,
  completeOnboardingStep,
  skipOnboardingStep,
  revertOnboardingStep,
  queueOnboardingEmail,
} from "../actions";
import { ONBOARDING_EMAIL_KEYS } from "../constants";

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

type StepRow = {
  id: string;
  step_number: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
};

interface TableState {
  /** Existing checklist for the centre, if any. */
  existingChecklist?: { id: string; centre_id: string } | null;
  /** Step rows returned for the targeted checklist. */
  steps?: StepRow[];
  /** Role to return from profiles.select().eq().single(). */
  role?: "admin" | "ops" | "coach" | null;
  /** Centre row used for contact-email lookups. */
  centre?: {
    id: string;
    name?: string | null;
    contact_email?: string | null;
  };
  /** When inserted-id is used (insert("X").select().single()) — eg new checklist. */
  insertedChecklist?: { id: string };
  /** Single-step lookup result (for completeOnboardingStep step context). */
  stepContext?: { checklist_id: string; step_number: number } | null;
  /** Email-insert mock returns this error to simulate unique violations. */
  emailInsertError?: { code: string; message: string } | null;
}

interface TableCalls {
  checklistInserts: unknown[];
  stepInserts: unknown[];
  stepUpdates: unknown[];
  checklistUpdates: unknown[];
  emailInserts: unknown[];
  activityLog: unknown[];
  notifications: unknown[];
}

function setupTables(state: TableState): TableCalls {
  const calls: TableCalls = {
    checklistInserts: [],
    stepInserts: [],
    stepUpdates: [],
    checklistUpdates: [],
    emailInserts: [],
    activityLog: [],
    notifications: [],
  };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: state.role ? { role: state.role } : null,
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "centre_onboarding_checklists") {
      return {
        select: () => ({
          eq: (column: string, _value: unknown) => ({
            // Used: .eq("centre_id", id).maybeSingle() (idempotency check)
            //       .eq("id", id).maybeSingle()        (queueOnboardingEmail lookup)
            //       .eq("id", id).single()             (revert path step lookup, unused on this table)
            maybeSingle: () => {
              if (column === "centre_id") {
                return Promise.resolve({
                  data: state.existingChecklist ?? null,
                  error: null,
                });
              }
              if (column === "id") {
                // Once a checklist is inserted in-flight, queueOnboardingEmail
                // needs to look it up by id. Fall through to the inserted row.
                const found =
                  state.existingChecklist ??
                  (state.insertedChecklist
                    ? {
                        id: state.insertedChecklist.id,
                        centre_id:
                          state.centre?.id ?? "c-unknown",
                      }
                    : null);
                return Promise.resolve({
                  data: found,
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
            // .eq("id", ...).eq("status", ...) chain used by revert path
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
        insert: (row: unknown) => {
          calls.checklistInserts.push(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: state.insertedChecklist ?? { id: "cl-new" },
                  error: null,
                }),
            }),
          };
        },
        update: (row: unknown) => {
          calls.checklistUpdates.push(row);
          return {
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          };
        },
      };
    }

    if (table === "centre_onboarding_steps") {
      return {
        select: () => ({
          eq: (col: string, _val: unknown) => {
            // Two patterns reach here:
            //   .select("status").eq("checklist_id", id) → array
            //   .select("checklist_id, step_number").eq("id", id).single() → row
            const result = {
              data: state.steps ?? [],
              error: null,
            };
            const single = () =>
              Promise.resolve({
                data: state.stepContext ?? null,
                error: null,
              });
            return {
              single,
              eq: () => ({
                single,
              }),
              maybeSingle: () =>
                Promise.resolve({
                  data: state.stepContext ?? null,
                  error: null,
                }),
              then: (
                resolve: (value: typeof result) => unknown
              ) => resolve(result),
            };
          },
        }),
        insert: (rows: unknown) => {
          calls.stepInserts.push(rows);
          return Promise.resolve({ error: null });
        },
        update: (row: unknown) => {
          calls.stepUpdates.push(row);
          return {
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
              then: (resolve: (value: { error: null }) => unknown) =>
                resolve({ error: null }),
            }),
          };
        },
      };
    }

    if (table === "centres") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: state.centre ?? null,
                error: null,
              }),
            maybeSingle: () =>
              Promise.resolve({
                data: state.centre ?? null,
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "centre_onboarding_emails") {
      return {
        insert: (row: unknown) => {
          calls.emailInserts.push(row);
          return Promise.resolve({
            error: state.emailInsertError ?? null,
          });
        },
      };
    }

    if (table === "activity_log") {
      return {
        insert: (row: unknown) => {
          calls.activityLog.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === "notifications") {
      return {
        insert: (row: unknown) => {
          calls.notifications.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }

    throw new Error(`unmocked table ${table}`);
  });

  return calls;
}

function mockUser(id: string | null) {
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: id ? { id } : null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// createOnboardingChecklist (== startCentreOnboarding)
// ============================================================

describe("startCentreOnboarding", () => {
  it("is idempotent — returns the existing checklist id if one exists", async () => {
    mockUser("ops-1");
    const calls = setupTables({
      existingChecklist: { id: "cl-existing", centre_id: "c1" },
      role: "ops",
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    const result = await startCentreOnboarding("c1");

    expect(result).toEqual({ checklistId: "cl-existing" });
    expect(calls.checklistInserts).toHaveLength(0);
    expect(calls.stepInserts).toHaveLength(0);
    expect(calls.emailInserts).toHaveLength(0);
  });

  it("creates the checklist + 10 steps and queues the welcome lifecycle email", async () => {
    mockUser("ops-1");
    const calls = setupTables({
      existingChecklist: null,
      insertedChecklist: { id: "cl-new" },
      role: "ops",
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    const result = await startCentreOnboarding("c1");
    expect(result).toEqual({ checklistId: "cl-new" });

    expect(calls.checklistInserts).toHaveLength(1);
    // Exactly one bulk-insert of 10 step rows
    expect(calls.stepInserts).toHaveLength(1);
    const steps = calls.stepInserts[0] as Array<{
      step_number: number;
      step_type: string;
      scheduled_for: string | null;
    }>;
    expect(steps).toHaveLength(10);
    expect(steps.map((s) => s.step_number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    // Step 4 ("Request child list") is scheduled +2d; others aren't.
    expect(steps.find((s) => s.step_number === 4)?.scheduled_for).toBeTruthy();
    expect(steps.find((s) => s.step_number === 5)?.scheduled_for).toBeNull();

    // Lifecycle welcome email queued (sent_at: null, sentinel step 0)
    expect(calls.emailInserts).toHaveLength(1);
    const queued = calls.emailInserts[0] as {
      email_type: string;
      sent_at: string | null;
      step_number: number;
    };
    expect(queued.email_type).toBe(ONBOARDING_EMAIL_KEYS.welcome);
    expect(queued.sent_at).toBeNull();
    expect(queued.step_number).toBe(0);

    // Activity log + ops notification fire
    expect(calls.activityLog).toHaveLength(1);
    expect(calls.notifications).toHaveLength(1);
  });
});

// ============================================================
// completeOnboardingStep — auth, cascades
// ============================================================

describe("completeOnboardingStep", () => {
  it("rejects coach-role callers", async () => {
    mockUser("coach-1");
    setupTables({ role: "coach" });

    const result = await completeOnboardingStep("step-1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/admin or ops/i);
    }
  });

  it("happy path: marks step complete, logs activity, no cascade when <5 done", async () => {
    mockUser("ops-1");
    const stepsAfter: StepRow[] = [
      { id: "s1", step_number: 1, status: "completed" },
      { id: "s2", step_number: 2, status: "pending" },
      { id: "s3", step_number: 3, status: "pending" },
    ];
    const calls = setupTables({
      role: "ops",
      stepContext: { checklist_id: "cl-1", step_number: 1 },
      steps: stepsAfter,
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    const result = await completeOnboardingStep("s1");
    expect(result).toEqual({ success: true });

    expect(calls.stepUpdates).toHaveLength(1);
    expect(
      (calls.stepUpdates[0] as { status: string }).status
    ).toBe("completed");

    // Activity log records the completion
    const stepLogs = calls.activityLog.filter(
      (r) =>
        (r as { action: string }).action ===
        "centre_onboarding_step_completed"
    );
    expect(stepLogs).toHaveLength(1);

    // No lifecycle email queued (halfway threshold not hit yet)
    expect(calls.emailInserts).toHaveLength(0);

    // Checklist NOT yet marked completed
    expect(calls.checklistUpdates).toHaveLength(0);
  });

  it("queues halfway email when crossing 5-of-10 boundary", async () => {
    mockUser("ops-1");
    // 5 of 10 steps now done after this completion
    const stepsAfter: StepRow[] = [
      { id: "s1", step_number: 1, status: "completed" },
      { id: "s2", step_number: 2, status: "completed" },
      { id: "s3", step_number: 3, status: "completed" },
      { id: "s4", step_number: 4, status: "completed" },
      { id: "s5", step_number: 5, status: "completed" },
      { id: "s6", step_number: 6, status: "pending" },
      { id: "s7", step_number: 7, status: "pending" },
      { id: "s8", step_number: 8, status: "pending" },
      { id: "s9", step_number: 9, status: "pending" },
      { id: "s10", step_number: 10, status: "pending" },
    ];
    const calls = setupTables({
      role: "ops",
      stepContext: { checklist_id: "cl-1", step_number: 5 },
      steps: stepsAfter,
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    await completeOnboardingStep("s5");

    const halfway = calls.emailInserts.find(
      (r) =>
        (r as { email_type: string }).email_type ===
        ONBOARDING_EMAIL_KEYS.halfwayCheckIn
    );
    expect(halfway).toBeTruthy();
    expect((halfway as { sent_at: string | null }).sent_at).toBeNull();
    expect(calls.checklistUpdates).toHaveLength(0);
  });

  it("queues first-session-prep email when step 7 completes", async () => {
    mockUser("ops-1");
    const stepsAfter: StepRow[] = [
      { id: "s7", step_number: 7, status: "completed" },
    ];
    const calls = setupTables({
      role: "ops",
      stepContext: { checklist_id: "cl-1", step_number: 7 },
      steps: stepsAfter,
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    await completeOnboardingStep("s7");

    const prep = calls.emailInserts.find(
      (r) =>
        (r as { email_type: string }).email_type ===
        ONBOARDING_EMAIL_KEYS.firstSessionPrep
    );
    expect(prep).toBeTruthy();
  });

  it("on last step completion: flips checklist to completed AND queues celebration email", async () => {
    mockUser("ops-1");
    // All 10 done
    const stepsAfter: StepRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i + 1}`,
      step_number: i + 1,
      status: "completed" as const,
    }));
    const calls = setupTables({
      role: "ops",
      stepContext: { checklist_id: "cl-1", step_number: 10 },
      steps: stepsAfter,
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    await completeOnboardingStep("s10");

    expect(calls.checklistUpdates).toHaveLength(1);
    expect(
      (calls.checklistUpdates[0] as { status: string }).status
    ).toBe("completed");

    const celebration = calls.emailInserts.find(
      (r) =>
        (r as { email_type: string }).email_type ===
        ONBOARDING_EMAIL_KEYS.completionCelebration
    );
    expect(celebration).toBeTruthy();
  });
});

// ============================================================
// skipOnboardingStep
// ============================================================

describe("skipOnboardingStep", () => {
  it("rejects coach-role callers", async () => {
    mockUser("coach-1");
    setupTables({ role: "coach" });

    const result = await skipOnboardingStep("s1", "n/a");
    expect("error" in result).toBe(true);
  });

  it("counts a skip toward the completion threshold (last step skipped → checklist complete)", async () => {
    mockUser("ops-1");
    // 9 completed, last one is now being skipped → 10/10 terminal
    const stepsAfter: StepRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i + 1}`,
      step_number: i + 1,
      status: i === 9 ? ("skipped" as const) : ("completed" as const),
    }));
    const calls = setupTables({
      role: "ops",
      stepContext: { checklist_id: "cl-1", step_number: 10 },
      steps: stepsAfter,
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", name: "Centre One", contact_email: "c1@test.com" },
    });

    await skipOnboardingStep("s10", "not applicable for this centre");

    expect(calls.checklistUpdates).toHaveLength(1);
    expect(
      (calls.checklistUpdates[0] as { status: string }).status
    ).toBe("completed");
  });
});

// ============================================================
// revertOnboardingStep
// ============================================================

describe("revertOnboardingStep", () => {
  it("requires admin or ops", async () => {
    mockUser("coach-1");
    setupTables({ role: "coach" });

    const result = await revertOnboardingStep("s1");
    expect("error" in result).toBe(true);
  });

  it("resets the step to pending, clears completion fields, and logs", async () => {
    mockUser("ops-1");
    const calls = setupTables({
      role: "ops",
      stepContext: { checklist_id: "cl-1", step_number: 3 },
      existingChecklist: { id: "cl-1", centre_id: "c1" },
    });

    const result = await revertOnboardingStep("s3");
    expect(result).toEqual({ success: true });

    expect(calls.stepUpdates).toHaveLength(1);
    const update = calls.stepUpdates[0] as {
      status: string;
      completed_at: string | null;
      completed_by: string | null;
    };
    expect(update.status).toBe("pending");
    expect(update.completed_at).toBeNull();
    expect(update.completed_by).toBeNull();

    const revertLog = calls.activityLog.find(
      (r) =>
        (r as { action: string }).action ===
        "centre_onboarding_step_reverted"
    );
    expect(revertLog).toBeTruthy();
  });
});

// ============================================================
// queueOnboardingEmail
// ============================================================

describe("queueOnboardingEmail", () => {
  it("is idempotent — returns queued: false when the unique index trips (23505)", async () => {
    mockUser("ops-1");
    const calls = setupTables({
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", contact_email: "c1@test.com" },
      emailInsertError: { code: "23505", message: "duplicate key" },
    });

    const result = await queueOnboardingEmail(
      "cl-1",
      ONBOARDING_EMAIL_KEYS.welcome
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ queued: false });
    expect(calls.emailInserts).toHaveLength(1); // attempted exactly once
  });

  it("queues with sent_at NULL and the lifecycle email_type", async () => {
    mockUser("ops-1");
    const calls = setupTables({
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", contact_email: "c1@test.com" },
    });

    const result = await queueOnboardingEmail(
      "cl-1",
      ONBOARDING_EMAIL_KEYS.halfwayCheckIn
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ queued: true });

    const row = calls.emailInserts[0] as {
      checklist_id: string;
      email_type: string;
      sent_at: string | null;
      sent_to: string;
      step_number: number;
    };
    expect(row.checklist_id).toBe("cl-1");
    expect(row.email_type).toBe(ONBOARDING_EMAIL_KEYS.halfwayCheckIn);
    expect(row.sent_at).toBeNull();
    expect(row.sent_to).toBe("c1@test.com");
    expect(row.step_number).toBe(0);
  });

  it("refuses to queue when the centre has no contact email", async () => {
    mockUser("ops-1");
    const calls = setupTables({
      existingChecklist: { id: "cl-1", centre_id: "c1" },
      centre: { id: "c1", contact_email: null },
    });

    const result = await queueOnboardingEmail(
      "cl-1",
      ONBOARDING_EMAIL_KEYS.welcome
    );
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/contact email/i);
    expect(calls.emailInserts).toHaveLength(0);
  });
});
