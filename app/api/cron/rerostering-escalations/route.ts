import { NextResponse } from "next/server";
import { processRerosteringEscalations } from "@/lib/rerostering/actions";

export const dynamic = "force-dynamic";

// ============================================================
// /api/cron/rerostering-escalations — every 15 minutes
// ============================================================
//
// Drives the rerostering timeout loop:
//   - replacement offers past their 30-min TTL flip to "expired" and
//     ops get notified to try the next candidate
//   - today's still-unfilled sessions escalate at the 4hr mark (ops
//     alert) and the 2hr mark (centre email + urgent task)
//
// Before this cron existed, processRerosteringEscalations was exported
// but never invoked — offers expired silently and the escalation
// cascade never fired.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { expired, escalated } = await processRerosteringEscalations();
    return NextResponse.json({
      message: "Rerostering escalations processed",
      expired,
      escalated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("rerostering-escalations cron error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
