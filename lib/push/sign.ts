// ============================================================
// Web Push signer (VAPID + RFC 8030)
// ============================================================
//
// This module produces the headers + body required to dispatch a
// single push to a browser-issued endpoint. It implements:
//
//  - VAPID authentication (RFC 8292): an ES256 JWT signed by the
//    server's VAPID private key, identifying the application server
//    to the push service so it accepts our request.
//
//  - SIMPLIFICATION: per the spec we DO NOT implement RFC 8291
//    payload encryption (ECDH on P-256 + HKDF + AES-GCM). The push
//    request goes out with NO body. Browsers receive the push but
//    the service worker's `push` event has no `event.data`. The
//    existing service worker (worker/index.ts) already handles this
//    fallback by rendering a generic "Build Alpha Kids -- you have a
//    new update" notification, so push still fires end-to-end. Custom
//    titles + bodies should be carried via the in-app notifications
//    row (already populated by triggerNotification in
//    lib/notifications/send.ts) so the bell shows the actual content
//    when the user opens the app from the generic banner. If full
//    payload encryption is needed later, the encryption goes here
//    and the body length / Content-Encoding header would change.
//
// All cryptography uses WebCrypto (`globalThis.crypto.subtle`) so
// the same code path runs in Node 20+, Edge, and browsers. No
// external deps.
//
// Public entry point is `signPushRequest`. `signPushRequest`
// returns the headers + (empty) body. The caller dispatches with
// `fetch(subscription.endpoint, { method: 'POST', ...result })`.

/**
 * A PushSubscription serialised to JSON (the same shape the browser
 * returns from `PushSubscription.toJSON()`).
 */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface VapidKeys {
  publicKey: string; // url-safe base64
  privateKey: string; // url-safe base64
  subject: string; // mailto: or https:
}

/**
 * Dev-only deterministic VAPID keys. Used when the env vars are
 * unset so tests + local dev can exercise the full code path without
 * pushing real notifications. These keys are NOT registered with any
 * push service -- requests using them will be rejected by Apple +
 * Google. That's fine for tests; production must set real keys.
 *
 * Generated once with `scripts/generate-vapid-keys.ts`, committed
 * deliberately because they're known-bad. Rotation is a no-op since
 * they were never used.
 */
const DEV_VAPID_KEYS: VapidKeys = {
  publicKey:
    "BJUT9JcukfQP4o_fDajwqjwgAzY75sFWluxj9bFf15lRjyLJcDcHznidPjfWCbvZ7ghXRIiHas4E_AbbXcRpUKU",
  privateKey: "HcJBl8WYZ2dvuWnr3YQzKhJ4mqSpFqkmWar-avHWN78",
  subject: "mailto:jayden@buildalphakids.com.au",
};

let warnedAboutDevKeys = false;

export function getVapidKeys(): VapidKeys {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (publicKey && privateKey && subject) {
    return { publicKey, privateKey, subject };
  }

  if (!warnedAboutDevKeys) {
    console.warn(
      "Using dev-only VAPID keys; push won't reach real browsers.",
    );
    warnedAboutDevKeys = true;
  }
  return DEV_VAPID_KEYS;
}

// ----------------------------------------------------------------
// base64url helpers
// ----------------------------------------------------------------

export function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function base64UrlDecode(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

// ----------------------------------------------------------------
// VAPID JWT (ES256 over P-256)
// ----------------------------------------------------------------

/**
 * Extract the registrable origin (scheme + host[:port]) for the
 * VAPID `aud` claim. Push services reject mismatched aud, so this
 * MUST exactly match the endpoint origin -- not the application
 * origin.
 */
function audienceFor(endpoint: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}

/**
 * Convert a raw ECDSA signature (r||s, 64 bytes for P-256) returned
 * by WebCrypto into a JOSE-compatible base64url string. WebCrypto's
 * ECDSA signature is already raw r||s, which is the JOSE form.
 */
function rawSignatureToJose(raw: ArrayBuffer): string {
  return base64UrlEncode(new Uint8Array(raw));
}

/**
 * Build the uncompressed SEC1 (0x04 || X || Y, 65 bytes) public key
 * from the base64url-encoded VAPID public key. Web push public keys
 * are distributed in this form already.
 */
function importVapidPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(publicKeyB64);
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
}

/**
 * Import a 32-byte d-value (the VAPID private key) as a P-256
 * ECDSA signing key. WebCrypto won't accept a raw d-scalar, so we
 * have to fabricate the JWK and let it derive x/y from d. Since
 * we already have the public key around, embed x/y too.
 */
async function importVapidPrivateKey(
  privateKeyB64: string,
  publicKeyB64: string,
): Promise<CryptoKey> {
  const dBytes = base64UrlDecode(privateKeyB64);
  if (dBytes.length !== 32) {
    throw new Error(
      `VAPID private key must be 32 bytes; got ${dBytes.length}`,
    );
  }
  const pubBytes = base64UrlDecode(publicKeyB64);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error(
      "VAPID public key must be 65 bytes uncompressed (0x04 || X || Y).",
    );
  }
  const x = pubBytes.slice(1, 33);
  const y = pubBytes.slice(33, 65);

  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(dBytes),
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Sign a VAPID JWT (header.payload.signature) for the given push
 * endpoint. Audience is derived from the endpoint origin, expiry is
 * `now + ttlSeconds` (capped at 24h per VAPID spec), subject comes
 * from VAPID_SUBJECT.
 */
export async function signVapidJwt(
  endpoint: string,
  vapidKeys: VapidKeys,
  ttlSeconds: number = 12 * 60 * 60,
): Promise<string> {
  // RFC 8292 caps `exp` at now + 24h.
  const cappedTtl = Math.min(ttlSeconds, 24 * 60 * 60);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audienceFor(endpoint),
    exp: Math.floor(Date.now() / 1000) + cappedTtl,
    sub: vapidKeys.subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(
    encoder.encode(JSON.stringify(header)),
  );
  const payloadB64 = base64UrlEncode(
    encoder.encode(JSON.stringify(payload)),
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await importVapidPrivateKey(
    vapidKeys.privateKey,
    vapidKeys.publicKey,
  );
  const sigRaw = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${rawSignatureToJose(sigRaw)}`;
}

// ----------------------------------------------------------------
// Push request shape
// ----------------------------------------------------------------

export interface SignedPushRequest {
  /** Headers to dispatch with the POST to the endpoint. */
  headers: Record<string, string>;
  /**
   * Body of the POST. Empty per the simplification above; the
   * service worker renders default content.
   */
  body: Uint8Array;
}

/**
 * Build the headers + body to push to a single subscription.
 *
 * NOTE: payload encryption is stubbed (see top-of-file comment). The
 * `payload` argument is recorded in the audit log via the caller in
 * lib/push/actions.ts but is NOT encrypted into the request body.
 * The browser's push event will fire with no data; the SW falls
 * back to generic content and the in-app notification carries the
 * specific title + body.
 */
export async function signPushRequest(
  subscription: PushSubscriptionJSON,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  payload: { title: string; body: string; url?: string; tag?: string },
  vapidKeys: VapidKeys,
  ttl: number = 60,
): Promise<SignedPushRequest> {
  const jwt = await signVapidJwt(subscription.endpoint, vapidKeys);

  const headers: Record<string, string> = {
    // RFC 8030 message retention; 60s is fine for "right now" alerts.
    TTL: String(ttl),
    // VAPID auth -- "vapid t=<jwt>, k=<public key url-safe b64>".
    Authorization: `vapid t=${jwt}, k=${vapidKeys.publicKey}`,
  };

  // Empty body. If/when we wire RFC 8291 encryption, set
  // Content-Encoding: aes128gcm and a non-empty body here.
  const body = new Uint8Array();

  return { headers, body };
}
