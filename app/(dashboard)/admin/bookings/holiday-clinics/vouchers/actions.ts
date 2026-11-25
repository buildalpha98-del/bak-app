"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireSummerVoucherAdmin } from "@/lib/bookings/summer-voucher-admin";
import { summerSquare } from "@/lib/bookings/summer-square";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { summerClinicsEnabled } from "@/lib/bookings/summer-clinics";

const path = "/admin/bookings/holiday-clinics/vouchers";
type Link = { payment_link: { id: string; order_id: string; url: string } };

export async function manageSummerVoucher(form: FormData) {
  const operator = await requireSummerVoucherAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success || !summerClinicsEnabled()) throw new Error("Invalid voucher booking.");
  const db = createSupabaseAdmin();
  const choice = form.get("choice");
  if (choice === "claim") {
    const { data, error } = await db.from("summer_clinic_orders")
      .update({ voucher_state: "reviewing", voucher_claimed_by: operator })
      .eq("id", id.data).eq("status", "held").eq("voucher_state", "requested")
      .gt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .select("id").maybeSingle();
    if (error || !data) throw new Error("The request is no longer available to claim.");
  } else if (choice === "release" || choice === "takeover") {
    const claimant = z.uuid().safeParse(form.get("expectedClaimant"));
    if (!claimant.success || form.get("safeToChangeClaim") !== "yes") throw new Error("Verify the current claim before changing it.");
    const { data, error } = await db.from("summer_clinic_orders")
      .update(choice === "release" ? { status: "cancelled" } : { voucher_claimed_by: operator })
      .eq("id", id.data).eq("status", "held").eq("voucher_state", "reviewing")
      .eq("voucher_credit_cents", 0).eq("voucher_claimed_by", claimant.data).is("square_order_id", null).select("id").maybeSingle();
    if (error || !data) throw new Error("The claim can no longer be changed.");
  } else if (choice === "record") {
    const receipts = Array.from({ length: 6 }, (_, child) =>
      form.getAll(`receipt-${child}`).filter(value => typeof value === "string" && value.trim())
        .map(reference => ({ child, reference }))).flat();
    const { error } = await db.rpc("record_summer_voucher_payment", {
      order_key: id.data, operator_id: operator, receipts,
    });
    if (error) throw new Error("Could not record the voucher. Check the redemption references and review state.");
  } else if (choice === "balance") {
    const { data } = await db.from("summer_clinic_orders")
      .select("amount_cents,voucher_credit_cents,voucher_balance_closed_at,checkout_url,clinic_dates")
      .eq("id", id.data).eq("status", "held").eq("voucher_state", "recorded").single();
    if (!data || data.voucher_balance_closed_at || data.amount_cents <= data.voucher_credit_cents) throw new Error("No balance is due.");
    if (data.checkout_url) return;
    const earliest = [...data.clinic_dates].sort()[0];
    const sydneyDate = sydneyTodayIso();
    if (earliest <= sydneyDate) throw new Error("Contact the family to resolve payment for this booking.");
    const confirmation = new URL("/holiday-clinics/summer/confirmation", process.env.BAK_SUMMER_CHECKOUT_ORIGIN);
    confirmation.searchParams.set("booking", id.data);
    const { payment_link: link } = await summerSquare<Link>("/online-checkout/payment-links", {
      idempotency_key: `voucher-${id.data}`,
      quick_pay: {
        name: "Build Alpha Kids summer clinics · voucher balance",
        price_money: { currency: "AUD", amount: data.amount_cents - data.voucher_credit_cents },
        location_id: process.env.SQUARE_LOCATION_ID,
      },
      checkout_options: { redirect_url: confirmation.href },
    });
    const { data: saved, error } = await db.from("summer_clinic_orders").update({
      square_order_id: link.order_id, square_link_id: link.id, checkout_url: link.url,
    }).eq("id", id.data).eq("status", "held").eq("voucher_state", "recorded").select("id").maybeSingle();
    if (!saved || error) throw new Error("Unable to save the Square balance link. Retry the same booking.");
  } else {
    throw new Error("Invalid voucher action.");
  }
  revalidatePath(path);
}
