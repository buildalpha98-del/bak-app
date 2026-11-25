import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireSummerVoucherAdmin } from "@/lib/bookings/summer-voucher-admin";
import { formatSummerDate, type SummerParticipant } from "@/lib/bookings/summer-clinics";
import { manageSummerVoucher } from "./actions";

const button = "rounded border px-3 py-2 font-semibold";

export default async function SummerVoucherRequests() {
  const operator = await requireSummerVoucherAdmin();
  const { data, error } = await createSupabaseAdmin().from("summer_clinic_orders")
    .select("id,booking_children,parent_name,parent_email,parent_phone,voucher_state,voucher_claimed_by,voucher_credit_cents,amount_cents,checkout_url,voucher_balance_closed_at")
    .eq("status", "held").not("voucher_state", "is", null).order("created_at");
  if (error) return <p role="alert">Unable to load voucher bookings.</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Summer clinic voucher requests</h1>
      <p>Claim the request before redeeming in Service NSW. Enter the official redemption reference after payment. Keep voucher codes in Service NSW.</p>
      {data.length === 0 && <p>No open requests.</p>}
      {data.map((booking) => (
        <section key={booking.id} className="space-y-3 rounded-xl border bg-white p-4">
          <h2 className="font-bold">{booking.parent_name} · {booking.voucher_state}</h2>
          <p>{booking.parent_email} · {booking.parent_phone}</p>
          <Link className="underline" href={`/holiday-clinics/summer/confirmation?booking=${booking.id}`}>Family booking status</Link>
          <form action={manageSummerVoucher} className="space-y-3">
            <input type="hidden" name="id" value={booking.id} />
            {(booking.booking_children as SummerParticipant[]).map((child, index) => (
              <fieldset key={index} className="space-y-2">
                <legend>{child.name} · {child.dates.map(formatSummerDate).join(", ")}</legend>
                {booking.voucher_state === "reviewing" && booking.voucher_claimed_by === operator &&
                  Array.from({ length: child.dates.length === 1 ? 1 : 2 }, (_, receipt) => (
                    <label key={receipt} className="block">Redemption reference {receipt + 1}
                      <input name={`receipt-${index}`} maxLength={80} className="ml-2 rounded border p-2" />
                    </label>
                  ))}
              </fieldset>
            ))}
            {booking.voucher_state === "requested" && <button name="choice" value="claim" className={button}>Claim before redeeming</button>}
            {booking.voucher_state === "reviewing" && booking.voucher_claimed_by === operator &&
              <button name="choice" value="record" className={button}>Record redeemed vouchers</button>}
            {booking.voucher_state === "reviewing" && (
              <div className="space-y-2 rounded border p-3">
                <input type="hidden" name="expectedClaimant" value={booking.voucher_claimed_by} />
                <label className="block">
                  <input type="checkbox" name="safeToChangeClaim" value="yes" className="mr-2" />
                  I have checked the Service NSW redemption status and coordinated with the staff member handling this claim.
                </label>
                {booking.voucher_claimed_by !== operator &&
                  <button name="choice" value="takeover" className={button}>Take over claim</button>}
                <button name="choice" value="release" className={button}>Release places only if no voucher was redeemed</button>
              </div>
            )}
            {booking.voucher_state === "recorded" && booking.voucher_balance_closed_at && <p>Balance checkout closed. Contact the family to resolve this booking.</p>}
            {booking.voucher_state === "recorded" && !booking.voucher_balance_closed_at && (
              booking.checkout_url ? <a className="underline" href={booking.checkout_url}>Open Square balance link</a> :
                <button name="choice" value="balance" className={button}>Create Square balance link · ${(booking.amount_cents - booking.voucher_credit_cents) / 100}</button>
            )}
          </form>
        </section>
      ))}
    </div>
  );
}
