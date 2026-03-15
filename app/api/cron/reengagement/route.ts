import { NextResponse } from "next/server";
import { processReengagement } from "@/lib/utils/reengagement";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const results = await processReengagement();
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("Re-engagement cron error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
