"use server";

import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SUMMER_CLINICS, formatSummerDate, summerClinicsEnabled } from "@/lib/bookings/summer-clinics";
import { summerSquare } from "@/lib/bookings/summer-square";

const inputSchema = z.object({
  key: z.uuid(),
  child: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  dates: z.array(z.string()).max(3).refine((dates) =>
    (dates.length === 1 || dates.length === 3) &&
    new Set(dates).size === dates.length &&
    dates.every((date) => SUMMER_CLINICS.some((clinic) => clinic.date === date)),
  ),
});

type Link = { payment_link: { id: string; order_id: string; url: string } };

type CheckoutResult = { url?: string; error?: string };

export async function startSummerCheckout(_previous: CheckoutResult, form: FormData): Promise<CheckoutResult> {
  if (!summerClinicsEnabled()) return { error: "Bookings are currently closed." };
  const input = inputSchema.safeParse({
    key: form.get("key"), child: form.get("child"), email: form.get("email"),
    dates: form.getAll("dates"),
  });
  if (!input.success) return { error: "Choose one or three dates and enter your child's name and your email." };

  const { key, child, email, dates } = input.data;
  const admin = createSupabaseAdmin();
  const { data: order, error } = await admin.rpc("reserve_summer_clinic_order", {
    order_key: key, chosen_dates: [...dates].sort(), name: child, email,
  });
  if (error || !order) {
    return { error: error?.code === "P0001" ? error.message : "Could not reserve those dates. Refresh the page and try again." };
  }
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
        name: `Summer Sports · ${description}`,
        location_id: process.env.SQUARE_LOCATION_ID,
        price_money: { amount: order.amount_cents, currency: "AUD" },
      },
      checkout_options: { redirect_url: confirmation.href },
    });
    const { data: saved, error: saveError } = await admin.from("summer_clinic_orders").update({
      square_order_id: link.order_id, square_link_id: link.id, checkout_url: link.url,
    }).eq("id", key).eq("status", "held").select("id").maybeSingle();
    if (saveError || !saved) throw new Error("Could not save the active checkout.");
    return { url: link.url };
  } catch {
    return { error: "Square checkout could not open. Retry with the same details to recover your reservation." };
  }
}
