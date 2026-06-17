import type { SmsProvider } from "./provider";

/**
 * Twilio REST-API implementation of {@link SmsProvider}.
 *
 * Reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
 * from the environment. When any one of them is missing the provider
 * reports `isConfigured() === false` and `getSmsProvider()` falls back
 * to the mock — so the platform keeps booting in dev without a Twilio
 * account.
 *
 * No SDK dependency: we hit the REST API with native fetch + Basic auth
 * so the bundle stays lean and CI doesn't need a new install step.
 */

/**
 * Normalise an Australian phone number into E.164 format.
 *
 * Strips spaces, dashes, parens, and leading "+", then:
 *   - `04xxxxxxxx`  → `+614xxxxxxxx`
 *   - `614xxxxxxxx` (already country-coded, no plus) → `+614xxxxxxxx`
 *   - `+614xxxxxxxx` (already E.164) → returned as-is
 *
 * Anything else (US numbers, landlines, garbage) returns `null` so the
 * caller can surface a clean validation error rather than letting Twilio
 * reject it as a 400 we'd have to translate anyway.
 *
 * Exported for the test suite — production code path is through `send()`.
 */
export function normaliseAuPhone(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  // Strip whitespace, dashes, parens, dots — keep digits and a leading +
  const cleaned = raw.replace(/[\s\-().]/g, "");

  // Already E.164 AU mobile
  if (/^\+614\d{8}$/.test(cleaned)) return cleaned;

  // 614xxxxxxxx (country code without +)
  if (/^614\d{8}$/.test(cleaned)) return `+${cleaned}`;

  // 04xxxxxxxx — the common Australian mobile format
  if (/^04\d{8}$/.test(cleaned)) return `+61${cleaned.slice(1)}`;

  return null;
}

export class TwilioProvider implements SmsProvider {
  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly fromNumber: string | undefined;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER;
  }

  isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken && this.fromNumber);
  }

  async send(
    to: string,
    body: string,
  ): Promise<{ id: string | null; error: string | null }> {
    if (!this.isConfigured()) {
      return { id: null, error: "Twilio not configured" };
    }

    const normalised = normaliseAuPhone(to);
    if (!normalised) {
      return { id: null, error: "Invalid phone format" };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    const params = new URLSearchParams();
    params.set("From", this.fromNumber!);
    params.set("To", normalised);
    params.set("Body", body);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const json = (await res.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
        code?: number;
      };

      if (!res.ok) {
        const msg =
          json.message ||
          `Twilio request failed (${res.status}${json.code ? ` ${json.code}` : ""})`;
        return { id: null, error: msg };
      }

      return { id: json.sid ?? null, error: null };
    } catch (err) {
      return {
        id: null,
        error: err instanceof Error ? err.message : "Twilio request failed",
      };
    }
  }
}
