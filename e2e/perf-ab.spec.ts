import { test } from "@playwright/test";
import { signInAs } from "./fixtures/auth";

// ============================================================
// A/B: server time across deployments
// ============================================================
//
// Measuring total navigation from Sydney to a Mumbai deployment is
// useless for this question — the number is mostly my own network, and
// its variance is bigger than the effect. Two things fix that:
//
//  1. responseEnd - requestStart for the DOCUMENT request: one round
//     trip plus ALL of the server's work. Assets and hydration are
//     excluded.
//
//     Note it is deliberately NOT TTFB. This app streams — Next flushes
//     the loading.tsx shell before fetching anything — so responseStart
//     lands at ~12ms from Sydney and says nothing about the queries.
//     The server's work finishes at the last byte of the stream.
//  2. Every old deployment is still live at its own URL, so the before
//     and after builds can be measured from one machine, interleaved,
//     minutes apart. Whatever the network is doing, it does it to both.
//
// Interleaved and repeated, then compared on the MEDIAN — a single
// sample here is worth nothing.

const ABDUL = "abdul@buildalphakids.com.au";

const BUILDS: Record<string, string> = {
  "before (6b2a1ff)": "https://bak-l8hgwbdl9-buildalpha98-dels-projects.vercel.app",
  "auth-dedup (1abfa7c)": "https://bak-yo511q5st-buildalpha98-dels-projects.vercel.app",
  "+no-prefetch (0f9eb0e)": "https://bak-l7osvi2co-buildalpha98-dels-projects.vercel.app",
};

const PAGES = ["/admin", "/admin/tasks", "/admin/bookings", "/admin/staff"];
const ROUNDS = 3;

test("perf A/B: server time per build", async ({ browser }) => {
  test.setTimeout(900_000);

  // deployment -> path -> samples
  const samples: Record<string, Record<string, number[]>> = {};
  for (const name of Object.keys(BUILDS)) {
    samples[name] = {};
    for (const p of PAGES) samples[name][p] = [];
  }

  for (let round = 0; round < ROUNDS; round++) {
    // Interleave builds within each round so any drift in network or
    // database load hits all three roughly equally.
    for (const [name, origin] of Object.entries(BUILDS)) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signInAs(page, ABDUL, origin);
        for (const path of PAGES) {
          try {
            await page.goto(origin + path, { waitUntil: "domcontentloaded" });
            const streamMs = await page.evaluate(() => {
              const nav = performance.getEntriesByType(
                "navigation"
              )[0] as PerformanceNavigationTiming | undefined;
              return nav ? nav.responseEnd - nav.requestStart : -1;
            });
            if (streamMs > 0) samples[name][path].push(Math.round(streamMs));
          } catch {
            // A failed nav contributes no sample rather than a zero.
          }
        }
      } finally {
        await context.close();
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log("\nPERF_JSON_START\n" + JSON.stringify(samples) + "\nPERF_JSON_END\n");
});
