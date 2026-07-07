import { NextResponse } from "next/server";
import { sendTermPacks } from "@/lib/client/service-emails";

export const dynamic = "force-dynamic";

// Daily check: when a term's end_date has passed (within a 14-day
// window), send each active centre its term wrap-up once. Idempotent
// per (centre, term) via email_log markers.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendTermPacks();
    return NextResponse.json({ message: "Term packs processed", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("term-packs cron error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
