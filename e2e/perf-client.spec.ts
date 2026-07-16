import { test } from "@playwright/test";
import { signInAs } from "./fixtures/auth";

// Diagnostic: where does the time AFTER the document stream go?
// Server work ends at responseEnd (~0.8s). The audit waits for network
// idle and sees ~4.8s. This splits the difference into JS weight,
// hydration, and whatever the page fetches once it has mounted.
const ABDUL = "abdul@buildalphakids.com.au";
const PAGES = ["/admin", "/admin/bookings", "/admin/staff", "/admin/roster"];

test("client-side breakdown", async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  await signInAs(page, ABDUL, baseURL!);

  for (const path of PAGES) {
    // Requests the page makes AFTER the document — i.e. not the HTML.
    const post: { url: string; type: string; ms: number }[] = [];
    const started = new Map<string, number>();
    page.on("request", (r) => started.set(r.url(), Date.now()));
    page.on("requestfinished", (r) => {
      const t0 = started.get(r.url());
      const type = r.resourceType();
      if (!t0 || type === "document") return;
      post.push({ url: r.url(), type, ms: Date.now() - t0 });
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming;
      const res = performance.getEntriesByType(
        "resource"
      ) as PerformanceResourceTiming[];
      const bytes = (f: (r: PerformanceResourceTiming) => boolean) =>
        res.filter(f).reduce((s, r) => s + (r.transferSize || 0), 0);
      return {
        docStreamEnd: Math.round(nav.responseEnd - nav.requestStart),
        domInteractive: Math.round(nav.domInteractive - nav.requestStart),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.requestStart),
        loadEvent: Math.round(nav.loadEventEnd - nav.requestStart),
        scriptCount: res.filter((r) => r.initiatorType === "script").length,
        scriptKb: Math.round(bytes((r) => r.name.includes("/_next/static")) / 1024),
        fetchCount: res.filter((r) => r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest").length,
      };
    });

    const slowest = post
      .filter((r) => r.type === "fetch" || r.type === "xhr")
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 4)
      .map((r) => `${new URL(r.url).pathname.slice(0, 42)} ${r.ms}ms`);

    // eslint-disable-next-line no-console
    console.log(
      `\nCLIENT| ${path}\n` +
        `   doc stream done : ${timing.docStreamEnd}ms\n` +
        `   dom interactive : ${timing.domInteractive}ms\n` +
        `   DOMContentLoaded: ${timing.domContentLoaded}ms\n` +
        `   load event      : ${timing.loadEvent}ms\n` +
        `   JS: ${timing.scriptCount} files, ${timing.scriptKb}kb  |  post-mount fetches: ${timing.fetchCount}\n` +
        (slowest.length ? `   slowest fetches: ${slowest.join(" | ")}\n` : "")
    );
    page.removeAllListeners("request");
    page.removeAllListeners("requestfinished");
  }
});
