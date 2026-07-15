import { test, expect } from "@playwright/test";
import { signInAs, findUserEmail } from "./fixtures/auth";

// ============================================================
// Ops workflow audit — NOT part of the smoke suite
// ============================================================
//
// Walks Abdul's actual weekly job as the ops role and reports what a
// real user would hit: server errors, console errors, dead pages, slow
// loads. Read-only — it opens things, it never writes.
//
// Run with: npx playwright test e2e/audit.spec.ts
// This is a diagnostic, not a gate. `npm run e2e` deliberately skips it
// (see the testIgnore in playwright.config.ts).

type PageReport = {
  path: string;
  status: number | null;
  // Where we ACTUALLY ended up. A financial page returning 200 tells you
  // nothing on its own — 200 at /admin?denied=financial means the gate
  // worked, 200 at /admin/payroll means Abdul is reading payroll.
  finalPath: string;
  ms: number;
  consoleErrors: string[];
  pageErrors: string[];
  bodyChars: number;
  emptyish: boolean;
};

// Abdul is role=admin (there is no ops profile in the database at all),
// with financial_access=false — so this is the portal he actually uses,
// and signing in as him exercises the financial gates for real.
const ABDUL = "abdul@buildalphakids.com.au";

const JOURNEY = [
  "/admin",
  "/admin/roster",
  "/admin/programs",
  "/admin/centres",
  "/admin/staff",
  "/admin/children",
  "/admin/assessments",
  "/admin/crm",
  "/admin/equipment",
  "/admin/tasks",
  "/admin/messages",
  "/admin/training",
  "/admin/reports",
  "/admin/feedback",
  "/admin/onboarding",
  "/admin/bookings",
  "/admin/announcements",
  "/admin/documents",
  "/admin/forms",
  "/admin/activity",
  "/admin/settings/programs",
  // Financial surfaces — Abdul must be redirected, not shown these.
  "/admin/payroll",
  "/admin/invoicing",
  "/admin/analytics",
];

test("audit: Abdul's weekly workflow", async ({ page, baseURL }) => {
  test.slow();
  const email = (await findUserEmail("admin")) ? ABDUL : null;
  test.skip(!email, "No admin profile to sign in as.");
  await signInAs(page, email!, baseURL!);

  const reports: PageReport[] = [];

  for (const path of JOURNEY) {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const onConsole = (m: import("@playwright/test").ConsoleMessage) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    };
    const onPageError = (e: Error) => pageErrors.push(e.message.slice(0, 200));
    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    const started = Date.now();
    let status: number | null = null;
    try {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      status = res?.status() ?? null;
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    } catch (err) {
      pageErrors.push(`navigation failed: ${(err as Error).message.slice(0, 160)}`);
    }
    const ms = Date.now() - started;

    const body = await page.locator("body").innerText().catch(() => "");
    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    let finalPath = "?";
    try {
      finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
    } catch {
      /* navigation failed outright */
    }

    reports.push({
      path,
      status,
      finalPath,
      ms,
      consoleErrors,
      pageErrors,
      bodyChars: body.length,
      // A page that renders almost nothing is the client-portal RLS bug's
      // signature — it looks "fine" but is an empty shell.
      emptyish: body.length < 400 || /Application error|went wrong/i.test(body),
    });
  }

  // eslint-disable-next-line no-console
  console.log("\nAUDIT_JSON_START\n" + JSON.stringify(reports, null, 2) + "\nAUDIT_JSON_END\n");

  // Diagnostic, not a gate — always report, never fail the run. The JSON
  // above is the deliverable.
  const broken = reports.filter(
    (r) => (r.status ?? 500) >= 400 || r.emptyish || r.pageErrors.length > 0
  );
  // eslint-disable-next-line no-console
  console.log(`AUDIT_SUMMARY: ${broken.length}/${reports.length} pages look broken`);
});
