import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  welcomeParent,
  welcomeCoach,
  parentBulkInvite,
  staffOnboarding,
  welcomeCentre,
  bookingConfirmation,
  bookingCancellation,
  paymentReceipt,
  packageConfirmation,
  sessionReminderParent,
  sessionReminderCoach,
  rosterAssignment,
  rosterChange,
  weeklySchedule,
  invitation,
} from "@/lib/launch/email-templates";

// ============================================================
// Audience split — parents on .com.au, staff on .app
// ============================================================
//
// This module serves BOTH audiences off one shared layout. It used to
// hold a single APP_URL constant, so parent emails linked to the app
// domain — a different TLD, hence a different cookie jar, hence a second
// login. These tests pin each template to its audience's origin.

const APP = "https://buildalphakids.app";
const SITE = "https://buildalphakids.com.au";

beforeEach(() => {
  // Distinct origins so a leak between audiences is unambiguous.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", APP);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", SITE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Minimal valid inputs per template, paired with its expected audience.
const PARENT_TEMPLATES: Array<[string, () => { html: string }]> = [
  ["welcomeParent", () => welcomeParent({ name: "Jane" })],
  [
    "parentBulkInvite",
    () => parentBulkInvite({ firstName: "Jane", magicLinkUrl: `${SITE}/x` }),
  ],
  [
    "bookingConfirmation",
    () =>
      bookingConfirmation({
        parentName: "Jane",
        childName: "Sam",
        sessionName: "Soccer",
        date: "2026-08-01",
        time: "10:00",
        location: "Oval",
      }),
  ],
  [
    "bookingCancellation",
    () =>
      bookingCancellation({
        parentName: "Jane",
        childName: "Sam",
        sessionName: "Soccer",
        date: "2026-08-01",
      }),
  ],
  [
    "paymentReceipt",
    () =>
      paymentReceipt({
        parentName: "Jane",
        amount: "$50.00",
        description: "Term fees",
        date: "2026-08-01",
      }),
  ],
  [
    "packageConfirmation",
    () =>
      packageConfirmation({
        parentName: "Jane",
        packageName: "10 pack",
        sessions: 10,
        amount: "$500.00",
      }),
  ],
  [
    "sessionReminderParent",
    () =>
      sessionReminderParent({
        parentName: "Jane",
        childName: "Sam",
        sessionName: "Soccer",
        date: "2026-08-01",
        time: "10:00",
        location: "Oval",
      }),
  ],
];

const COACH_SESSION = {
  time: "10:00",
  centreName: "Sunshine",
  address: "1 Oval Rd",
  childCount: 12,
  programme: "Soccer",
  contactName: "Dir",
  contactPhone: "0412345678",
};

const STAFF_TEMPLATES: Array<[string, () => { html: string }]> = [
  ["welcomeCoach", () => welcomeCoach({ name: "Coach" })],
  [
    "staffOnboarding",
    () =>
      staffOnboarding({
        name: "Coach",
        role: "coach",
        email: "c@example.com",
        tempPassword: "pw",
      }),
  ],
  ["welcomeCentre", () => welcomeCentre({ name: "Dir", centreName: "Sunshine" })],
  [
    "sessionReminderCoach",
    () => sessionReminderCoach({ coachName: "Coach", sessions: [COACH_SESSION] }),
  ],
  [
    "rosterAssignment",
    () =>
      rosterAssignment({
        coachName: "Coach",
        sessionName: "Soccer",
        centreName: "Sunshine",
        date: "2026-08-01",
        time: "10:00",
        address: "1 Oval Rd",
      }),
  ],
  [
    "rosterChange",
    () =>
      rosterChange({
        coachName: "Coach",
        changeType: "cancelled",
        originalSession: "Soccer, 1 Aug",
      }),
  ],
  [
    "weeklySchedule",
    () =>
      weeklySchedule({
        coachName: "Coach",
        weekStartDate: "2026-08-01",
        sessions: [
          {
            day: "Monday",
            time: "10:00",
            centreName: "Sunshine",
            address: "1 Oval Rd",
            programme: "Soccer",
          },
        ],
      }),
  ],
];

describe("launch email templates — parent-facing link to the marketing origin", () => {
  it.each(PARENT_TEMPLATES)("%s links to .com.au, never .app", (_name, build) => {
    const { html } = build();
    expect(html).toContain(SITE);
    expect(html).not.toContain(APP);
  });
});

describe("launch email templates — staff-facing link to the app domain", () => {
  it.each(STAFF_TEMPLATES)("%s links to .app, never .com.au", (_name, build) => {
    const { html } = build();
    expect(html).toContain(APP);
    expect(html).not.toContain(SITE);
  });
});

describe("parentBulkInvite — the f0898d9 regression guard", () => {
  it("names the marketing origin in the expiry fallback copy", () => {
    // The 'if the link expired, head to X/parent-login' copy is the one
    // that most directly undoes the host-aware magic link work.
    const { html } = parentBulkInvite({
      firstName: "Jane",
      magicLinkUrl: `${SITE}/auth/callback`,
    });
    expect(html).toContain(`${SITE}/parent-login`);
    expect(html).not.toContain(`${APP}/parent-login`);
  });
});

describe("invitation — audience follows the invited ROLE at runtime", () => {
  it("sends a parent invite to the marketing origin", () => {
    const { html } = invitation({
      name: "Jane",
      role: "parent",
      inviteUrl: `${SITE}/parent-login?invite=1`,
      invitedBy: "Admin",
    });
    expect(html).toContain(SITE);
    expect(html).not.toContain(APP);
  });

  it.each(["coach", "centre_director"])(
    "sends a %s invite to the app domain",
    (role) => {
      const { html } = invitation({
        name: "Sam",
        role,
        inviteUrl: `${APP}/auth/accept-invite?token=1`,
        invitedBy: "Admin",
      });
      expect(html).toContain(APP);
      expect(html).not.toContain(SITE);
    }
  );
});

describe("shared layout footer", () => {
  it("offers notification preferences to parents only", () => {
    // /parent/settings is a parent-only surface — it used to render in
    // coach and centre emails too, where the link is meaningless.
    expect(welcomeParent({ name: "Jane" }).html).toContain(
      `${SITE}/parent/settings`
    );
    expect(welcomeCoach({ name: "Coach" }).html).not.toContain(
      "/parent/settings"
    );
  });

  it("honours NEXT_PUBLIC_MARKETING_URL for the parent logo/footer origin", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://staging.example.com");
    const { html } = welcomeParent({ name: "Jane" });
    expect(html).toContain("https://staging.example.com/logo.png");
  });
});
