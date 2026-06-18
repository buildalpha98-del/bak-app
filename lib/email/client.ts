import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

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
