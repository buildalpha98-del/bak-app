import { requireCronAuth } from "@/lib/utils/apiProtection";
import { NextResponse } from "next/server";
import { processReengagement } from "@/lib/utils/reengagement";

export async function GET(request: Request) {
  // Verify cron secret

  const cronError = requireCronAuth(request);
  if (cronError) return cronError;

  try {
    const results = await processReengagement();
    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    // Surface the actual error message + stack instead of swallowing it.
    // Previously a generic "Processing failed" hid the real issue and made
    // diagnosing why re-engagement wasn't firing nearly impossible.
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Re-engagement cron error:", message, stack);
    return NextResponse.json(
      {
        success: false,
        error: message,
        // Stack only in non-prod — don't leak infra paths to anyone with
        // the CRON_SECRET (which is admin-equivalent anyway, but still).
        stack: process.env.NODE_ENV !== "production" ? stack : undefined,
      },
      { status: 500 }
    );
  }
}
