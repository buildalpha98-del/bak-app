"use server";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { summerSquare } from "@/lib/bookings/summer-square";

const participantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dates: z.array(z.string()).max(3).refine((dates) =>
    (dates.length === 1 || dates.length === 3) &&
    new Set(dates).size === dates.length &&
    dates.every((date) => SUMMER_CLINICS.some((clinic) => clinic.date === date)),
  ),
});
const inputSchema = z.object({
  key: z.uuid(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^(?:\+?61[ -]?|0)4(?:[ -]?\d){8}$/),
  email: z.email().max(254),
  children: z.array(participantSchema).min(1).max(6),
});

type Link = { payment_link: { id: string; order_id: string; url: string } };

type CheckoutResult = { url?: string; error?: string };

export async function startSummerCheckout(_previous: CheckoutResult, form: FormData): Promise<CheckoutResult> {
  if (!summerClinicsEnabled()) return { error: "Bookings are currently closed." };
  let children: unknown;
  const participants = form.get("children");
  if (typeof participants === "string" && participants.length <= 5000) {
    try { children = JSON.parse(participants); } catch { /* Invalid form payload. */ }
  }
  const input = inputSchema.safeParse({
    key: form.get("payment") === "voucher" ? form.get("voucherKey") : form.get("key"), name: form.get("parentName"), email: form.get("email"),
    phone: form.get("phone"), children,
  });
  if (!input.success) return { error: "Enter your details and choose one or three dates for each child." };

  const { key, name, phone, email } = input.data;
  const digits = phone.replace(/\D/g, "");
  const mobile = digits.startsWith("0") ? `+61${digits.slice(1)}` : `+${digits}`;
  let clientFingerprint: string | undefined;
  if (process.env.VERCEL_ENV === "production") {
    const address = (await headers()).get("x-vercel-forwarded-for")?.trim();
    if (!address || !isIP(address) || !process.env.CRON_SECRET) {
      return { error: "Could not start checkout. Please try again or call 0426 722 003." };
    }
    clientFingerprint = createHmac("sha256", process.env.CRON_SECRET)
      .update(`summer-clinics:${address}`).digest("hex");
  }
  const voucher = form.get("payment") === "voucher";
  const admin = createSupabaseAdmin();
  const { data: order, error } = await admin.rpc(voucher ? "request_summer_voucher_order" : "reserve_summer_family_order", {
    order_key: key, participants: input.data.children, guardian_name: name, email, guardian_phone: mobile,
    ...(clientFingerprint && { client_fingerprint: clientFingerprint }),
  });
  if (error || !order) {
    return { error: error?.code === "P0001" ? error.message : "Could not reserve those dates. Refresh the page and try again." };
  }
  if (voucher) return { url: `/holiday-clinics/summer/confirmation?booking=${key}` };
  if (order.voucher_state) return { error: "This booking is already awaiting voucher payment." };
  if (Date.parse(order.created_at) <= Date.now() - 30 * 60_000) {
    return { error: "This checkout has expired. Reload to start a new booking." };
  }
  if (order.checkout_url) return { url: order.checkout_url as string };

  try {
    const site = new URL(process.env.BAK_SUMMER_CHECKOUT_ORIGIN!);
    const confirmation = new URL("/holiday-clinics/summer/confirmation", site);
    confirmation.searchParams.set("booking", key);
    const description = order.clinic_dates.map(formatSummerDate).join(", ");
    const { payment_link: link } = await summerSquare<Link>("/online-checkout/payment-links", {
      idempotency_key: key,
      quick_pay: {
        name: `Summer Sports · ${input.data.children.length} ${input.data.children.length === 1 ? "child" : "children"} · ${description}`,
        location_id: process.env.SQUARE_LOCATION_ID,
        price_money: { amount: order.amount_cents, currency: "AUD" },
      },
      checkout_options: { redirect_url: confirmation.href },
      pre_populated_data: { buyer_email: email, buyer_phone_number: mobile },
    });
    const { data: saved, error: saveError } = await admin.from("summer_clinic_orders").update({
      square_order_id: link.order_id, square_link_id: link.id, checkout_url: link.url,
    }).eq("id", key).eq("status", "held").is("voucher_state", null).select("id").maybeSingle();
    if (saveError || !saved) throw new Error("Could not save the active checkout.");
    return { url: link.url };
  } catch {
    return { error: "Square checkout could not open. Retry with the same details to recover your reservation." };
  }
}
