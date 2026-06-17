import type { SmsProvider } from "./provider";

/**
 * Console-logging stub for dev and tests.
 *
 * `isConfigured()` returns true outside production OR when `MOCK_SMS=1`
 * is set explicitly. This means:
 *   - vitest + Next dev server get a working "SMS" channel without creds
 *   - prod stays opt-in: you'd only set MOCK_SMS=1 if you wanted to
 *     verify the dispatch path on a deployed preview without hitting Twilio
 *
 * `send()` warns to the console (so the message is visible in dev logs
 * but doesn't get swallowed as a regular `log`) and returns a synthetic
 * id prefixed with `mock-` so audit rows are still easy to spot.
 */
export class MockSmsProvider implements SmsProvider {
  isConfigured(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.MOCK_SMS === "1";
  }

  async send(
    to: string,
    body: string,
  ): Promise<{ id: string | null; error: string | null }> {
    // Visible warning so dev sessions surface the message in logs.
    console.warn("[MOCK SMS] →", to, ":", body);
    const suffix = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
      .toString()
      .replace(/-/g, "")
      .slice(0, 8);
    return { id: `mock-${suffix}`, error: null };
  }
}
