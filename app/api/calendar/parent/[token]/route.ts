import { NextResponse } from "next/server";
import { verifyCalendarToken } from "@/lib/calendar/token";
import { serialiseToICS } from "@/lib/calendar/ics";
import { getParentEvents } from "@/lib/calendar/feed-actions";

/**
 * Public, unauthenticated parent calendar feed.
 *
 * Token is the auth — see `app/api/calendar/coach/[token]/route.ts` for the
 * full leak-surface notes (identical here).
 */

const NOT_FOUND = new NextResponse("Not found", { status: 404 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params;
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;

  const verified = verifyCalendarToken("parent", token);
  if (!verified) return NOT_FOUND;

  const events = await getParentEvents(verified.entityId);
  const ics = serialiseToICS(events, { name: "Build Alpha Kids — Family Bookings" });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="bak-parent.ics"',
    },
  });
}
