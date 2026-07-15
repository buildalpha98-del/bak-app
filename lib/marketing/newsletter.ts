"use server";

// ============================================================
// Newsletter capture — server action, SERVER ONLY
// ============================================================
//
// The homepage signup posts here. Writes newsletter_subscribers
// (migration 069) with the service-role client, which is the only
// thing that can reach the table — RLS is on with no policies, so
// this action IS the write path, and the honeypot and rate limit
// below are the whole of the defence rather than a first layer.
//
// Everything user-visible lives in lib/marketing/content.ts. This
// module returns codes, never prose, so the form owns the copy and
// the rules stay testable (lib/marketing/__tests__/newsletter.test.ts)
// — the same split as lib/marketing/enquiry.ts.
//
// The file is "use server", so only async functions may be exported;
// the helpers here are module-private on purpose, not by oversight.

import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type NewsletterErrorCode =
  /** Nothing typed. */
  | "email_required"
  /** Typed, but not an email address. */
  | "email_invalid"
  /** Per-IP limit tripped. */
  | "rate_limited"
  /** The write failed. Not the subscriber's fault, not their problem to fix. */
  | "failed";

/**
 * What the form renders. Never throws: a thrown server action surfaces
 * to the client as an opaque digest, which would cost us the subscriber
 * and tell them nothing.
 */
export type NewsletterResult = { ok: true } | { ok: false; code: NewsletterErrorCode };

/**
 * Same loose pattern as the enquiry form, for the same reason: catch
 * the typo the subscriber can fix, don't out-lawyer RFC 5322. On a
 * capture form, rejecting a valid address is the worse failure.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The longest address SMTP allows. Longer is junk, not a subscriber. */
const EMAIL_MAX_LENGTH = 254;

// Per-IP rate limit — same in-memory, per-process shape as
// app/api/crm/enquiry/route.ts. Single-instance only; if this ever runs
// on more than one instance the limit becomes per-instance, and both
// this and the enquiry route need a shared store together.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Server actions have no request object — the IP comes from headers().
 * "unknown" buckets every unresolvable caller together, which is the
 * conservative choice: they share one allowance rather than each
 * getting their own.
 */
async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown"
  );
}

/** A trimmed string for a field, or "" for anything that isn't one (File, absent). */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * source_page is a hidden field, so it is caller-controlled: anything
 * that isn't a same-site path is discarded rather than stored. The
 * column is a breadcrumb for whoever reads the list later, not a place
 * to let a bot park a URL.
 */
function normaliseSourcePage(raw: string): string | null {
  if (!raw.startsWith("/")) return null;
  return raw.slice(0, 200);
}

export async function subscribeToNewsletter(
  formData: FormData
): Promise<NewsletterResult> {
  try {
    // Honeypot first, before the rate limit: a bot that fills it gets a
    // clean success and burns none of the allowance a real subscriber
    // behind the same NAT might need. Nothing is recorded.
    if (readField(formData, "website")) return { ok: true };

    if (isRateLimited(await getClientIp())) return { ok: false, code: "rate_limited" };

    const raw = readField(formData, "email");
    if (!raw) return { ok: false, code: "email_required" };

    // Lowercased on the way in — unlike leads.contact_email, this table
    // is ours, and a subscriber list wants one row per human. Storing
    // the case they typed would let Alice@x.com and alice@x.com both
    // past the UNIQUE constraint.
    const email = raw.toLowerCase();
    if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
      return { ok: false, code: "email_invalid" };
    }

    const supabase = createSupabaseAdmin();

    // Upsert, not insert: signing up twice is normal behaviour, and a
    // resubscribe after an unsubscribe has to flip status back rather
    // than collide with the UNIQUE index. source_page follows so the
    // row records where they last came in from.
    const { error } = await supabase.from("newsletter_subscribers").upsert(
      {
        email,
        status: "subscribed",
        source_page: normaliseSourcePage(readField(formData, "source_page")),
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("Newsletter subscribe failed:", error);
      return { ok: false, code: "failed" };
    }

    return { ok: true };
  } catch (err) {
    console.error("Newsletter subscribe error:", err);
    return { ok: false, code: "failed" };
  }
}
