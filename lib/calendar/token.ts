/**
 * Stateless HMAC-signed token used to authenticate calendar feed URLs.
 *
 * Format: `<entityType>-<entityId>-<hmacHex>`
 *   - entityType ∈ {"coach", "parent", "centre"}
 *   - entityId is a UUID (so it never contains a `-` ambiguity issue if we
 *     split from the right — see `parseToken`)
 *   - hmacHex is the hex-encoded HMAC-SHA256 over `${entityType}:${entityId}`,
 *     using `process.env.CALENDAR_FEED_SECRET ?? "dev-secret"` as the key
 *
 * Why stateless?
 *   - No DB writes/reads on every calendar refresh (Apple Calendar polls
 *     aggressively — every 5 min by default).
 *   - Rotating the secret instantly invalidates every issued token.
 *
 * Leak surface (documented in the route handlers as well):
 *   - Whoever has the URL can read the calendar. That's the entire point
 *     (calendar subscriptions are unauthenticated by convention — no header
 *     auth in `webcal://`). Treat the URL as a secret. We mitigate by
 *     scoping each token to a single entity.
 */

import crypto from "node:crypto";

export type CalendarEntityType = "coach" | "parent" | "centre";

const VALID_TYPES: ReadonlySet<CalendarEntityType> = new Set([
  "coach",
  "parent",
  "centre",
]);

function getSecret(): string {
  return process.env.CALENDAR_FEED_SECRET ?? "dev-secret";
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/**
 * Generate a signed token. Pure function — never persists. Safe to call from
 * a server action.
 */
export function generateCalendarToken(
  entityType: CalendarEntityType,
  entityId: string,
): string {
  const payload = `${entityType}:${entityId}`;
  const sig = signPayload(payload);
  return `${entityType}-${entityId}-${sig}`;
}

/**
 * Parse + verify a token. Returns the entity id on success, `null` otherwise.
 *
 * Uses `crypto.timingSafeEqual` on the HMAC so attackers can't infer a valid
 * signature byte-by-byte.
 */
export function verifyCalendarToken(
  expectedType: CalendarEntityType,
  rawToken: string,
): { entityId: string } | null {
  if (!rawToken || typeof rawToken !== "string") return null;

  // Token shape: <type>-<uuid>-<hexsig>.
  // We split from the RIGHT so the signature (last 64 hex chars) comes off
  // cleanly, then peel the type off the front. Whatever is in the middle is
  // the entityId — UUIDs contain hyphens but our regex below validates shape.
  const lastDash = rawToken.lastIndexOf("-");
  if (lastDash < 0) return null;
  const sig = rawToken.slice(lastDash + 1);
  const rest = rawToken.slice(0, lastDash);

  const firstDash = rest.indexOf("-");
  if (firstDash < 0) return null;
  const type = rest.slice(0, firstDash) as CalendarEntityType;
  const entityId = rest.slice(firstDash + 1);

  if (!VALID_TYPES.has(type)) return null;
  if (type !== expectedType) return null;
  if (!entityId) return null;
  // Hex sig must be 64 chars (sha256 = 32 bytes = 64 hex).
  if (!/^[0-9a-f]{64}$/i.test(sig)) return null;

  const expectedSig = signPayload(`${type}:${entityId}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return { entityId };
}
