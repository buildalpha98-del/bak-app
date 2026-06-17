import type { SmsProvider } from "./provider";
import { TwilioProvider } from "./twilio-provider";
import { MockSmsProvider } from "./mock-provider";

/**
 * Singleton provider factory.
 *
 * Returns the Twilio provider when its three env vars are present,
 * otherwise the mock. The choice is sticky for the lifetime of the
 * Node process — call sites can assume `getSmsProvider()` is cheap
 * and won't flip mid-request.
 *
 * In production with no Twilio creds, this hands back the mock and
 * the mock's `isConfigured()` returns false (NODE_ENV === "production"
 * and MOCK_SMS unset), so the notification fallback knows to skip
 * SMS entirely rather than logging stub warnings into prod logs.
 */
let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;

  const twilio = new TwilioProvider();
  if (twilio.isConfigured()) {
    cached = twilio;
    return cached;
  }

  cached = new MockSmsProvider();
  return cached;
}

/**
 * Test-only escape hatch — clears the singleton between vitest cases
 * so changes to `process.env` (twilio creds, NODE_ENV) take effect.
 * Don't use in app code.
 */
export function __resetSmsProviderForTests(): void {
  cached = null;
}

export type { SmsProvider } from "./provider";
export { TwilioProvider, normaliseAuPhone } from "./twilio-provider";
export { MockSmsProvider } from "./mock-provider";
