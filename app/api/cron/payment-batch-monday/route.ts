import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import { getFortnightlyPeriod } from "@/lib/utils/payRates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const today = new Date();

  // Only act if today is a Monday (cron runs on Mondays, but belt-and-braces)
  if (today.getDay() !== 1) {
    return NextResponse.json({ message: "Not a Monday — skipping", day: today.getDay() });
  }

  // Get the just-ended fortnightly period (14 days ago sits within the previous period)
  const prevDate = new Date(today);
  prevDate.setDate(prevDate.getDate() - 7);
  const { start, end } = getFortnightlyPeriod(prevDate);

  const periodStart = start.toISOString().split("T")[0];
  const periodEnd = end.toISOString().split("T")[0];

  // Only create a batch if this Monday is the day AFTER the period ends
  // (period ends on Sunday, so Monday should be periodEnd + 1 day)
  const expectedMonday = new Date(end);
  expectedMonday.setDate(expectedMonday.getDate() + 1);
  const todayStr = today.toISOString().split("T")[0];
  const expectedMondayStr = expectedMonday.toISOString().split("T")[0];

  if (todayStr !== expectedMondayStr) {
    return NextResponse.json({
      message: "Mid-fortnight Monday — skipping",
      periodStart,
      periodEnd,
      today: todayStr,
      expectedMonday: expectedMondayStr,
    });
  }

  // Check if batch already exists
  const { data: existing } = await admin
    .from("payment_batches")
    .select("id")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      message: "Batch already exists for this period",
      batchId: existing.id,
      periodStart,
      periodEnd,
    });
  }

  // Create the batch
  const { data: batch, error } = await admin
    .from("payment_batches")
    .insert({
      period_start: periodStart,
      period_end: periodEnd,
      status: "calculating",
    })
    .select()
    .single();

  if (error || !batch) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create batch" },
      { status: 500 }
    );
  }

  // Notify all admins
  await triggerNotificationForOps({
    type: "payment_batch_created",
    title: "New payment period ready",
    body: `A new payment batch for ${periodStart} to ${periodEnd} is ready to calculate.`,
    entityType: "payment_batch",
    entityId: batch.id,
  });

  return NextResponse.json({
    message: "Payment batch created",
    batchId: batch.id,
    periodStart,
    periodEnd,
  });
}
