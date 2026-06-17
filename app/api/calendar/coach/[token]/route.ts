import { NextResponse } from "next/server";
import { verifyCalendarToken } from "@/lib/calendar/token";
import { serialiseToICS } from "@/lib/calendar/ics";
import { getCoachEvents } from "@/lib/calendar/feed-actions";

/**
 * Public, unauthenticated coach calendar feed.
 *
 * URL shape: `/api/calendar/coach/<entityType>-<entityId>-<hmac>.ics`
 *
 * Leak surface (intentional, documented):
 *   - Calendar subscription clients (Apple Calendar, Google Calendar, Outlook)
 *     refuse to send Authorization headers, so the token IS the auth.
 *   - Anyone with the URL can read the coach's roster. Treat as a secret.
 *     Rotate by changing `CALENDAR_FEED_SECRET` — instantly invalidates every
 *     token without a DB write.
 *   - We return 404 on bad signatures (not 401) so a probe can't distinguish
 *     "token forged" from "coach doesn't exist".
 */

const NOT_FOUND = new NextResponse("Not found", { status: 404 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params;
  // Strip `.ics` so the route works at `…/<token>.ics`.
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;

  const verified = verifyCalendarToken("coach", token);
  if (!verified) return NOT_FOUND;

  const events = await getCoachEvents(verified.entityId);
  const ics = serialiseToICS(events, { name: "Build Alpha Kids — My Sessions" });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="bak-coach.ics"',
    },
  });
}
