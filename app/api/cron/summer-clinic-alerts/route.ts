import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { SITE } from "@/lib/marketing/content";
import { formatSummerDate } from "@/lib/bookings/summer-clinics";

type Alert = { order_id: string; event: "voucher_requested" | "booking_confirmed"; clinic_dates: string[] };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== "production") return NextResponse.json({ sent: 0 });

  const db = createSupabaseAdmin();
  const { data, error } = await db.rpc("claim_summer_clinic_alerts");
  if (error) return NextResponse.json({ error: "Could not load clinic alerts." }, { status: 500 });

  let sent = 0;
  let failed = 0;
  const alerts: Alert[] = data ?? [];
  for (const alert of alerts) {
    const voucher = alert.event === "voucher_requested";
    const subject = voucher ? "Summer clinics: voucher request received" : "Summer clinics: booking confirmed";
    const dates = alert.clinic_dates.map(formatSummerDate).join(", ");
    const path = voucher ? "vouchers" : "summer-roster";
    const link = `${SITE.url}/admin/bookings/holiday-clinics/${path}`;
    const result = await sendEmail(
      SITE.email, subject,
      `<p>${subject} for ${dates}.</p><p><a href="${link}">${voucher ? "Open voucher requests" : "Open the summer clinic roster"}</a></p>`,
      `summer_clinic_${alert.event}`,
      { idempotencyKey: `summer-clinic/${alert.event}/${alert.order_id}` },
    );
    if (!result.success) {
      failed++;
      continue;
    }
    const { error: saveError } = await db.from("summer_clinic_alerts")
      .update({ sent_at: new Date().toISOString() }).eq("order_id", alert.order_id).eq("event", alert.event);
    if (saveError) failed++;
    else sent++;
  }
  const { count, error: pendingError } = await db.from("summer_clinic_alerts")
    .select("order_id", { count: "exact", head: true }).is("sent_at", null)
    .lt("queued_at", new Date(Date.now() - 23 * 60 * 60_000).toISOString());
  return NextResponse.json({ sent, failed, expired: count ?? 0 }, {
    status: failed || count || pendingError ? 500 : 200,
  });
}
