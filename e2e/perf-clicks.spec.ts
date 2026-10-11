import { test } from "@playwright/test";
import { signInAs } from "./fixtures/auth";

// Diagnostic: what does a sidebar CLICK cost? The other perf specs time
// hard loads (page.goto). Operators live in soft navigations — the
// router fetches an RSC payload and swaps the page — and that path has
// its own costs: no prefetch means nothing paints until the server
// answers, and middleware runs on every RSC request.
//
// Per click: time to the URL changing, to the old page's content being
// gone (loading shell or new page), and to the network going quiet; plus
// the RSC request's own duration and size.
const ABDUL = "abdul@buildalphakids.com.au";
const ROUTES = (process.env.PERF_ROUTES ??
  "/admin/roster,/admin/tasks,/admin,/admin/staff,/admin/centres,/admin/programs,/admin/roster,/admin/tasks,/admin")
  .split(",");

test("perf: sidebar click timings", async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  await signInAs(page, ABDUL, baseURL!);
  await page.goto("/admin", { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});

  const rsc: { url: string; start: number; end?: number; bytes?: number; status?: number }[] = [];
  page.on("request", (r) => {
    if (r.headers()["rsc"] === "1" || r.url().includes("_rsc=")) {
      rsc.push({ url: r.url(), start: Date.now() });
    }
  });
  page.on("requestfinished", async (r) => {
    const row = rsc.find((x) => x.url === r.url() && !x.end);
    if (!row) return;
    row.end = Date.now();
    const sizes = await r.sizes().catch(() => null);
    row.bytes = sizes?.responseBodySize;
    row.status = (await r.response())?.status();
  });

  for (const path of ROUTES) {
    rsc.length = 0;
    const link = page.locator(`a[href="${path}"]:visible`).first();
    if (!(await link.count())) {
      console.log(`CLICK| ${path} — no sidebar link, skipped`);
      continue;
    }
    await page.evaluate(() => performance.clearResourceTimings());
    // A person points before they click. Give intent prefetch the same
    // lead a real hover gets, on every build alike.
    await link.hover();
    await page.waitForTimeout(Number(process.env.PERF_HOVER_MS ?? 250));
    // First visible change in <main> after the click: the loading
    // skeleton if one was ready, else the new page.
    await page.evaluate(() => {
      const w = window as unknown as { __firstChange?: number; __obs?: MutationObserver };
      w.__firstChange = undefined;
      w.__obs?.disconnect();
      const main = document.querySelector("main") ?? document.body;
      const x = w as unknown as { __skeleton?: boolean; __content?: number };
      x.__skeleton = false;
      x.__content = undefined;
      w.__obs = new MutationObserver(() => {
        if (w.__firstChange === undefined) w.__firstChange = performance.now();
        const sk = !!main.querySelector('[data-slot="skeleton"]');
        if (sk) x.__skeleton = true;
        if (!sk && x.__content === undefined && location.pathname === (window as unknown as { __target: string }).__target)
          x.__content = performance.now();
      });
      w.__obs.observe(main, { childList: true, subtree: true, characterData: true });
    });
    await page.evaluate((p) => { (window as unknown as { __target: string }).__target = p; }, path);
    const tClick = await page.evaluate(() => performance.now());
    const t0 = Date.now();
    await link.click();
    await page.waitForURL((u) => u.pathname === path, { timeout: 60_000 });
    const tUrl = Date.now() - t0;
    await page.waitForFunction(() => (window as unknown as { __firstChange?: number }).__firstChange !== undefined, null, { timeout: 60_000 }).catch(() => {});
    const tFirst = Math.round(
      (await page.evaluate(() => (window as unknown as { __firstChange?: number }).__firstChange ?? NaN)) - tClick
    );
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    const tIdle = Date.now() - t0;
    const timing = await page.evaluate(() =>
      (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter((r) => r.name.includes("_rsc="))
        .map((r) => `ttfb ${Math.round(r.responseStart - r.requestStart)} total ${Math.round(r.responseEnd - r.startTime)} ${Math.round(r.encodedBodySize / 1024)}kb`)
        .join(" | ")
    );
    await page.waitForFunction(() => (window as unknown as { __content?: number }).__content !== undefined, null, { timeout: 30_000 }).catch(() => {});
    const { skeleton, content } = await page.evaluate(() => {
      const x = window as unknown as { __skeleton?: boolean; __content?: number };
      return { skeleton: !!x.__skeleton, content: x.__content ?? NaN };
    });
    const tContent = Math.round(content - tClick);
    const rscLines = timing + " || " + rsc
      .map((r) => {
        const u = new URL(r.url);
        return `${u.pathname}${r.status ? ` ${r.status}` : ""} ${r.end ? r.end - r.start : "?"}ms ${r.bytes ? Math.round(r.bytes / 1024) + "kb" : ""}`;
      })
      .join(" | ");
    console.log(
      `CLICK| ${path.padEnd(16)} first-change ${String(tFirst).padStart(5)}ms  skeleton ${skeleton ? "yes" : "no "}  content ${String(tContent).padStart(5)}ms  url-change ${String(tUrl).padStart(5)}ms  idle ${String(tIdle).padStart(5)}ms  rsc: ${rscLines}`
    );
  }
});
