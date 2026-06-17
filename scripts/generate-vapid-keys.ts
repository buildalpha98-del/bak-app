/* eslint-disable no-console */

// ============================================================
// One-time helper: generate a fresh VAPID key pair
// ============================================================
//
// Usage:
//
//   npx tsx scripts/generate-vapid-keys.ts
//
// Outputs both keys + the recommended VAPID_SUBJECT, all
// url-safe base64. Paste the three values into Vercel env vars:
//
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT
//
// Implementation uses node:crypto ECDSA on P-256 (the WebPush
// standard, same curve the runtime uses to sign requests in
// lib/push/sign.ts). No external deps required.
//
// Public key form: uncompressed SEC1 (0x04 || X || Y, 65 bytes).
// Private key form: the raw 32-byte `d` scalar.
// Both are emitted url-safe base64 (RFC 4648 section 5, no padding).

import { generateKeyPairSync } from "node:crypto";

function base64url(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function main(): void {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  // Public key as uncompressed SEC1 (0x04 || X || Y), derived from the JWK
  // representation directly -- KeyObject already supports `.export({format: 'jwk'})`.
  const pubJwk = publicKey.export({ format: "jwk" });
  if (!pubJwk.x || !pubJwk.y) {
    throw new Error("Failed to derive public key coordinates.");
  }
  const xBytes = Buffer.from(pubJwk.x, "base64url");
  const yBytes = Buffer.from(pubJwk.y, "base64url");
  const pubBytes = Buffer.concat([Buffer.from([0x04]), xBytes, yBytes]);

  // Private key as raw 32-byte d-scalar.
  const privJwk = privateKey.export({ format: "jwk" });
  if (!privJwk.d) {
    throw new Error("Failed to derive private key scalar.");
  }
  const dBytes = Buffer.from(privJwk.d, "base64url");

  const publicKeyB64 = base64url(pubBytes);
  const privateKeyB64 = base64url(dBytes);

  console.log("--- VAPID keys ---");
  console.log("");
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKeyB64}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`);
  console.log(`VAPID_SUBJECT=mailto:jayden@buildalphakids.com.au`);
  console.log("");
  console.log("Paste the three lines above into your Vercel env vars.");
  console.log("Rotate the private key periodically; the public key");
  console.log("is exposed to browsers and is safe to commit if you'd");
  console.log("rather hardcode it.");
}

main();
