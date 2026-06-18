import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

// The sender domain MUST be verified in Resend before sends will
// succeed. Canonical production domain is buildalphakids.app — keep
// this in sync with whatever domain you've verified.
export const FROM_EMAIL = "Build Alpha Kids <noreply@buildalphakids.app>";
