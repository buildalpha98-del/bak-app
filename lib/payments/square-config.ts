// ============================================================
// Square env-flag plumbing — switches between sandbox + production
// ============================================================
//
// Square has TWO entirely separate URL families: sandbox for testing
// (connect.squareupsandbox.com + sandbox.web.squarecdn.com) and
// production for real money (connect.squareup.com + web.squarecdn.com).
//
// Going live is a one-line env-var flip plus pasting your prod
// credentials. See docs/square-cutover.md for the full checklist.
//
// SQUARE_ENV (server) + NEXT_PUBLIC_SQUARE_ENV (client) must agree.
// Default is "sandbox" so a misconfigured deploy can't accidentally
// charge real cards.

type SquareEnv = "sandbox" | "production";

function readServerEnv(): SquareEnv {
  return process.env.SQUARE_ENV === "production" ? "production" : "sandbox";
}

function readClientEnv(): SquareEnv {
  return process.env.NEXT_PUBLIC_SQUARE_ENV === "production"
    ? "production"
    : "sandbox";
}

/** Server-side: Square Payments API base URL. */
export function getSquareApiUrl(): string {
  return readServerEnv() === "production"
    ? "https://connect.squareup.com/v2/payments"
    : "https://connect.squareupsandbox.com/v2/payments";
}

/** Client-side: Square Web Payments SDK script URL. */
export function getSquareWebSdkUrl(): string {
  return readClientEnv() === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

/**
 * `true` when running against Square production. Use to gate
 * "live mode" badges, warnings, and operator confirmations in the UI.
 */
export function isSquareLive(): boolean {
  return readServerEnv() === "production";
}

/** Client-side equivalent of isSquareLive(). */
export function isSquareLiveClient(): boolean {
  return readClientEnv() === "production";
}
