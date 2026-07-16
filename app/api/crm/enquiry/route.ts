import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";
import { headers } from "next/headers";
import { getBaseUrl } from "@/lib/utils/base-url";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { sendEmail } from "@/lib/email/send";
import { enquiryAcknowledgementEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

// Simple in-memory rate limiter (per-process; sufficient for single-instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 }); // 1 hour
    return false;
  }

  entry.count++;
  return entry.count > 10;
}

/**
 * The single source of truth for the CORS allowlist — used by both POST
 * and OPTIONS so the two can never drift apart.
 *
 * The WordPress origins are here because the legacy site posts to this
 * route cross-origin; they come out once WP is decommissioned. The app's
 * own origin is included so the same-origin marketing form works, both on
 * the canonical domain and on the vercel.app deployment used for
 * pre-cutover QA.
 *
 * Read at request time, not module load, so env changes are picked up.
 */
function getAllowedOrigins(): string[] {
  const origins = [
    "https://buildalphakids.com.au",
    "https://www.buildalphakids.com.au",
    "http://localhost:3000",
    getBaseUrl(),
  ];

  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  return [...new Set(origins)];
}

function withCors(response: NextResponse, origin: string, allowed: string[]) {
  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  return response;
}

/**
 * The web_form lead this email already lodged on the current Sydney day, if
 * any — the double-submit this dedupe defends against.
 *
 * Scoped to `source: "web_form"` deliberately. Matching on email across every
 * source would let an unrelated lead (a staff-created manual one, an import)
 * swallow a genuine enquiry: no lead, no ack, no staff notification, and the
 * enquirer still sees success.
 *
 * Both filters are narrowing only; the authoritative checks are done in JS:
 *  - The Sydney day (UTC+10/+11) opens on the *previous* UTC date, so the
 *    query window is widened by 24h and the day is matched via sydneyTodayIso.
 *    A fixed offset would break across DST.
 *  - ilike gives case-insensitive matching without changing what we store, but
 *    treats `_` and `%` as wildcards — and `_` is common in email addresses.
 *    The exact comparison below discards any such over-match, which would
 *    otherwise reintroduce the swallowed-lead failure mode.
 */
async function findTodaysWebEnquiry(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  email: string
): Promise<{ id: string } | null> {
  const today = sydneyTodayIso();
  const windowStart = new Date(
    Date.parse(`${today}T00:00:00Z`) - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("leads")
    .select("id, created_at, contact_email")
    .ilike("contact_email", email)
    .eq("source", "web_form")
    .gte("created_at", windowStart);

  const match = (data ?? []).find(
    (row: { created_at: string; contact_email: string | null }) =>
      sydneyTodayIso(new Date(row.created_at)) === today &&
      (row.contact_email ?? "").toLowerCase() === email.toLowerCase()
  );

  return match ? { id: match.id } : null;
}

export async function POST(request: NextRequest) {
  try {
    // CORS
    const origin = request.headers.get("origin") ?? "";
    const allowedOrigins = getAllowedOrigins();

    if (origin && !allowedOrigins.includes(origin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limiting
    const headersList = await headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    const {
      centre_name,
      contact_name,
      contact_email,
      contact_phone,
      message,
      type,
      suburb,
      programs_of_interest,
      source_page,
      website, // honeypot — real users never see this field
    } = body;

    // Honeypot: a filled field means a bot. Return success so the bot has
    // no signal to retry against, but record nothing.
    if (typeof website === "string" && website.trim()) {
      return withCors(
        NextResponse.json({ success: true, message: "Enquiry submitted successfully." }),
        origin,
        allowedOrigins
      );
    }

    // Validate required fields
    if (!centre_name?.trim()) {
      return NextResponse.json({ error: "Centre/school name is required." }, { status: 400 });
    }
    if (!contact_email?.trim()) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const email = contact_email.trim();
    const supabase = createSupabaseAdmin();

    // Dedupe: a second web enquiry from the same email on the same Sydney day
    // is almost always a double-submit, not a second lead.
    const duplicate = await findTodaysWebEnquiry(supabase, email);
    if (duplicate) {
      // No second lead, but the payload still lands on the existing one — a
      // resubmit often carries a longer or corrected message, and silently
      // dropping it loses information the enquirer believed they had sent.
      await supabase.from("lead_activities").insert({
        lead_id: duplicate.id,
        type: "system",
        content: `Duplicate enquiry received via website form (same email, same day). Message: ${message?.trim() ?? "(no message)"}`,
      });

      return withCors(
        NextResponse.json({
          success: true,
          deduped: true,
          message: "Enquiry already received today.",
        }),
        origin,
        allowedOrigins
      );
    }

    // "other" maps to a null type — leads.type is the centre_type enum, which
    // has no "other" member, so the detail goes in the notes instead.
    const orgType =
      type === "school" ? "school" : type === "other" ? null : "childcare_centre";

    const programs: string[] = Array.isArray(programs_of_interest)
      ? programs_of_interest.filter(
          (p: unknown): p is string => typeof p === "string" && p.trim().length > 0
        )
      : [];

    const noteParts: string[] = [];
    if (orgType === null) noteParts.push("Org type: other.");
    if (message?.trim()) noteParts.push(message.trim());
    if (programs.length) {
      noteParts.push(`Programs of interest: ${programs.join(", ")}.`);
    }
    const notes = noteParts.length ? noteParts.join("\n\n") : null;

    // Create lead
    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        centre_name: centre_name.trim(),
        type: orgType,
        contact_name: contact_name?.trim() ?? null,
        contact_email: email,
        contact_phone: contact_phone?.trim() ?? null,
        suburb: suburb?.trim() ?? null,
        source: "web_form",
        source_detail: source_page?.trim() ?? null,
        stage: "cold_lead",
        notes,
      })
      .select("id")
      .single();

    if (insertError || !lead) {
      console.error("Enquiry lead creation error:", insertError);
      return NextResponse.json({ error: "Failed to submit enquiry." }, { status: 500 });
    }

    // Create activity
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "system",
      content: `Enquiry received via website form. Message: ${message?.trim() ?? "(no message)"}`,
    });

    // Notify admin/ops
    const { data: staffUsers } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .in("role", ["admin", "ops"])
      .eq("status", "active");

    await triggerNotification(
      {
        type: "feedback_received",
        title: `New website enquiry from ${centre_name.trim()}`,
        body: `${contact_name ?? "Unknown"} (${email}) submitted an enquiry via the website.`,
        entityType: "lead",
        entityId: lead.id,
      },
      (staffUsers ?? []).map((s) => ({
        userId: s.id,
        email: s.email,
        name: s.name,
        role: s.role,
      }))
    );

    // Auto-acknowledgement. sendEmail is non-throwing by contract, but the
    // lead is already saved either way — a bounced ack must never turn a
    // captured enquiry into an error for the enquirer.
    const ack = enquiryAcknowledgementEmail(
      contact_name?.trim() ?? null,
      centre_name.trim()
    );
    try {
      await sendEmail(email, ack.subject, ack.html, "enquiry_acknowledgement");
    } catch (err) {
      console.error("Enquiry acknowledgement email failed:", err);
    }

    return withCors(
      NextResponse.json({ success: true, message: "Enquiry submitted successfully." }),
      origin,
      allowedOrigins
    );
  } catch (err) {
    console.error("Enquiry API error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = getAllowedOrigins();

  const response = new NextResponse(null, { status: 204 });

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Max-Age", "86400");
  }

  return response;
}
