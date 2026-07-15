import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Same env precedence as scripts/seed-program-series.ts: .env.local
// wins where it defines a var, the Vercel production pull fills the
// rest (that's where the Supabase keys live).
const local = dotenv.config({ path: resolve(__dirname, ".env.local") }).parsed ?? {};
const prod =
  dotenv.config({ path: resolve(__dirname, ".env.production.local") }).parsed ?? {};
// Merge onto the real environment — webServer.env REPLACES process.env
// rather than extending it, and a command with no PATH never starts.
const serverEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...prod,
  ...local,
};

const E2E_PORT = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  // Smoke tests hit one shared dev server and one shared database —
  // run them in order rather than fighting over it.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Dedicated port, never reused: a dev server already running on
        // :3000 (with whatever env it happened to start with) once got
        // adopted by the suite and every test failed against it.
        command: `npm run dev -- --port ${E2E_PORT}`,
        url: `http://localhost:${E2E_PORT}`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: serverEnv,
      },
});
