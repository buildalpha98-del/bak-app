import { Resend } from "resend";

// Lazily constructed. The SDK captures the API key at CONSTRUCTION time,
// and ES imports hoist above a script's dotenv.config() — so a
// module-level client leaves every CLI script permanently key-less
// (exactly how the AI seeder broke). Building on first use is identical
// for the app, since Next loads env before any module runs.
let client: Resend | null = null;

export function getResend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    // Previously this fell back to "re_placeholder", which turned a
    // missing key into a 401 at send time — reported to the caller as an
    // ordinary delivery failure and logged as such. Fail here instead,
    // naming the actual cause.
    if (!key) {
      throw new Error(
        "RESEND_API_KEY is not set. Add it to your environment before sending email."
      );
    }
    client = new Resend(key);
  }
  return client;
}

// The sender domain MUST be verified in Resend before sends will
// succeed. Canonical production domain is buildalphakids.app — keep
// this in sync with whatever domain you've verified.
//
// Why `hello@` and not `noreply@`:
//   - Spam filters score `noreply@` ~+0.3 toward junk (textbook
//     generic-sender pattern).
//   - Replies to noreply@ bounce, which damages domain reputation.
//   - `hello@` reads as human, lifts open + reply rates.
//   - Set up `hello@buildalphakids.app` as a monitored inbox (forwards
//     to your real one is fine) so replies aren't lost.
export const FROM_EMAIL = "Build Alpha Kids <hello@buildalphakids.app>";
