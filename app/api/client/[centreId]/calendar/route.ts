import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateICalFeed } from "@/lib/client/calendar-actions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;

  const supabase = await createSupabaseServerClient();

  // Auth check
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const icalContent = await generateICalFeed(centreId);

  return new NextResponse(icalContent, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bak-sessions.ics"',
      "Cache-Control": "private, no-cache",
    },
  });
}
