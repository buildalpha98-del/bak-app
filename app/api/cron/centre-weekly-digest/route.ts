import { NextResponse } from "next/server";
import { sendWeeklyCentreDigests } from "@/lib/client/service-emails";

export const dynamic = "force-dynamic";

// Monday-morning director digest. Scheduled Sunday 20:00 UTC =
// Monday 06:00 AEST / 07:00 AEDT — in the inbox before the school
// day starts, year-round. Idempotent per (centre, week) via
// email_log markers, so retries can't double-send.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendWeeklyCentreDigests();
    return NextResponse.json({ message: "Weekly digests processed", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("centre-weekly-digest cron error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
