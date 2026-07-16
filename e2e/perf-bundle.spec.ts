import { test } from "@playwright/test";
import { signInAs } from "./fixtures/auth";

// Per-page JS weight, each in a FRESH context so nothing is served from
// cache. Reusing one page across navigations makes whichever page went
// first look enormous (it pays for the shared framework) and the rest
// look weightless.
const ABDUL = "abdul@buildalphakids.com.au";
const PAGES = ["/admin", "/admin/bookings", "/admin/staff", "/admin/roster"];

test("per-page JS weight, cold cache", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  for (const path of PAGES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signInAs(page, ABDUL, baseURL!);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
      const r = await page.evaluate(() => {
        const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        // Chunk URLs carry a ?dpl= query string, so endsWith(".js") never matches.
        const js = res.filter((x) => new URL(x.name).pathname.endsWith(".js"));
        const kb = (arr: PerformanceResourceTiming[]) =>
          Math.round(arr.reduce((s, x) => s + (x.transferSize || 0), 0) / 1024);
        const biggest = [...js].sort((a,b)=>(b.transferSize||0)-(a.transferSize||0)).slice(0,3)
          .map(x => `${new URL(x.name).pathname.split("/").pop()!.slice(0,26)} ${Math.round((x.transferSize||0)/1024)}kb`);
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return { files: js.length, kb: kb(js), biggest, load: Math.round(nav.loadEventEnd - nav.requestStart) };
      });
      // eslint-disable-next-line no-console
      console.log(`BUNDLE| ${path.padEnd(18)} ${String(r.kb).padStart(4)}kb over ${String(r.files).padStart(2)} files  load=${r.load}ms  | ${r.biggest.join(", ")}`);
    } finally {
      await ctx.close();
    }
  }
});
