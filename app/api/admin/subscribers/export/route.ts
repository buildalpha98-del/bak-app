import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getNewsletterSubscribers,
  SUBSCRIBER_CSV_HEADERS,
} from "@/lib/marketing/subscribers";
import { toCsv } from "@/lib/marketing/csv";

// ============================================================
// Newsletter subscribers — CSV export
// ============================================================
//
// This route hands out the entire subscriber list: every email
// address we hold, in one request. It is the highest-value target on
// the marketing surface, so the guard below is the whole of the
// defence — note middleware.ts's matcher EXCLUDES `api/`, so NOTHING
// gates this route except this route. And the data comes from the
// service-role client, so RLS isn't a backstop either.
//
// Guard copied from app/api/forecasts/generate/route.ts (the only
// admin-ONLY API route in the codebase): authenticate, then read
// profiles.role and require exactly "admin" — 401 unauthenticated,
// 403 wrong role. Deliberately NOT the admin+ops check used by
// app/api/ai/generate-program and friends: middleware's ROLE_ROUTES
// gives ops no access to /admin at all, so the page that offers this
// download is admin-only, and the download must match it.

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getNewsletterSubscribers();

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const csv = toCsv(
    SUBSCRIBER_CSV_HEADERS,
    data.map((s) => [s.email, s.status, s.source_page, s.created_at])
  );

  const filename = `newsletter-subscribers-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      // charset=utf-8 so non-ASCII names in an address survive Excel.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Personal data — never let a proxy or the browser keep a copy.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
