import { test } from "@playwright/test";
import { signInAs } from "./fixtures/auth";

// Diagnostic: split a navigation's wait into network, middleware and render.
const ABDUL = "abdul@buildalphakids.com.au";
test("perf: ttfb split", async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  await signInAs(page, ABDUL, baseURL!);
  await page.goto("/ops", { waitUntil: "domcontentloaded" });
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const probes: [string, string, Record<string, string>][] = [
    ["static asset (pure RTT)", "/manifest.json", {}],
    ["robots (no auth)", "/robots.txt", {}],
    ["/api/health (bom1, 1 query, no mw)", "/api/health", {}],
    ["mw: /login signed-in (getUser+1q, 307)", "/login", { cookie }],
    ["mw: /set-password signed-in", "/set-password?_rsc=s", { rsc: "1", cookie }],
    ["mw only, no cookie -> /login", "/ops/roster?_rsc=z", { rsc: "1" }],
    ["/ops RSC", "/ops?_rsc=x1", { rsc: "1", "next-url": "/ops", cookie }],
    ["/ops/roster RSC", "/ops/roster?_rsc=x2", { rsc: "1", cookie }],
    ["/ops/staff RSC", "/ops/staff?_rsc=x3", { rsc: "1", cookie }],
    ["/ops/tasks RSC", "/ops/tasks?_rsc=x4", { rsc: "1", cookie }],
    ["/ops/centres RSC", "/ops/centres?_rsc=x5", { rsc: "1", cookie }],
  ];
  for (let round = 0; round < 3; round++) {
    for (const [name, path, headers] of probes) {
      const t0 = performance.now();
      const res = await fetch(baseURL + path + (path.includes("?") ? `&r=${round}` : ""), { headers, redirect: "manual" });
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      const ttfb = performance.now() - t0;
      let bytes = value?.length ?? 0;
      for (;;) { const c = await reader.read(); if (c.done) break; bytes += c.value.length; }
      const total = performance.now() - t0;
      console.log(`TTFB| ${name.padEnd(26)} ${res.status} first-chunk ${Math.round(ttfb)}ms done ${Math.round(total)}ms ${Math.round(bytes/1024)}kb mw=${res.headers.get("x-middleware-ms") ?? ""} region=${res.headers.get("x-vercel-id") ?? ""} loc=${res.headers.get("location") ?? ""}`);
    }
  }
});
