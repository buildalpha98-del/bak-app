import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { SITE } from "@/lib/marketing/content";
import { summerParentEmail } from "@/lib/bookings/summer-parent-email";

type ParentMessage = {
  order_id: string; message_key: string; clinic_date: string | null;
  recipient: string; send_before: string;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== "production") return NextResponse.json({ sent: 0 });

  const db = createSupabaseAdmin();
  const { data, error } = await db.rpc("claim_summer_clinic_parent_emails");
  if (error) return NextResponse.json({ error: "Could not load parent emails." }, { status: 500 });

  let sent = 0;
  let failed = 0;
  const messages: ParentMessage[] = data ?? [];
  for (const message of messages) {
    const { data: booking, error: bookingError } = await db.from("summer_clinic_orders")
      .select("clinic_dates,child_name,booking_children,amount_cents,voucher_credit_cents")
      .eq("id", message.order_id).eq("status", "paid").maybeSingle();
    if (bookingError) { failed++; continue; }
    if (!booking || Date.parse(message.send_before) <= Date.now()) continue;
    const email = summerParentEmail(booking, message.clinic_date);
    if (!email) { failed++; continue; }
    const result = await sendEmail(
      message.recipient, email.subject, email.html,
      message.clinic_date ? "summer_clinic_parent_reminder" : "summer_clinic_parent_confirmation",
      { replyTo: SITE.email, idempotencyKey: `summer-clinic-parent/${message.order_id}/${message.message_key}` },
    );
    if (!result.success) { failed++; continue; }
    const { error: saveError } = await db.from("summer_clinic_parent_emails").update({ sent_at: new Date().toISOString() })
      .eq("order_id", message.order_id).eq("message_key", message.message_key);
    if (saveError) failed++;
    else sent++;
  }
  const { count, error: expiryError } = await db.from("summer_clinic_parent_emails")
    .select("order_id, summer_clinic_orders!inner(status)", { count: "exact", head: true })
    .eq("summer_clinic_orders.status", "paid").is("sent_at", null).not("attempted_at", "is", null)
    .lte("send_before", new Date().toISOString());
  return NextResponse.json({ sent, failed, expired: count ?? 0 }, {
    status: failed || count || expiryError ? 500 : 200,
  });
}
