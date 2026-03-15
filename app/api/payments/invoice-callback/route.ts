import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotificationForOps } from "@/lib/notifications/send";

/**
 * Square Online Payment callback for invoice payments.
 * Called after a centre completes payment via Square Payment Link.
 *
 * Query params:
 *   - invoice_number: the BAK invoice number
 *   - payment_id: Square payment ID (optional, from redirect)
 *
 * In production, this should also verify with Square API that payment was successful.
 * For now it handles the redirect flow from Square Payment Links.
 */
export async function GET(req: NextRequest) {
  const invoiceNumber = req.nextUrl.searchParams.get("invoice_number");
  const squarePaymentId = req.nextUrl.searchParams.get("payment_id");

  if (!invoiceNumber) {
    return NextResponse.redirect(
      new URL("/client?error=missing_invoice", req.url)
    );
  }

  const admin = createSupabaseAdmin();

  // Look up the invoice
  const { data: invoice, error: fetchError } = await admin
    .from("outbound_invoices")
    .select("id, total_cents, paid_amount_cents, status, centre_id, invoice_number, centres(name)")
    .eq("invoice_number", invoiceNumber)
    .single();

  if (fetchError || !invoice) {
    console.error("Invoice callback: invoice not found", invoiceNumber);
    return NextResponse.redirect(
      new URL("/client?error=invoice_not_found", req.url)
    );
  }

  // Only process if not already fully paid
  if (invoice.status === "paid") {
    return NextResponse.redirect(
      new URL(`/client?payment=already_paid&invoice=${invoiceNumber}`, req.url)
    );
  }

  const totalCents = invoice.total_cents ?? 0;
  const previouslyPaid = invoice.paid_amount_cents ?? 0;
  const amountPaidCents = totalCents - previouslyPaid;
  const now = new Date().toISOString();
  const today = now.split("T")[0];

  // Record the payment
  const paymentRecord = {
    date: today,
    amount_cents: amountPaidCents,
    method: "square_online" as const,
    reference: squarePaymentId ?? "square_online_payment",
    notes: "Paid via Square online payment link",
    recorded_by: "system",
    recorded_at: now,
  };

  const existingHistory = Array.isArray(invoice.paid_amount_cents) ? [] : [];
  // We need to fetch the actual payment_history
  const { data: fullInvoice } = await admin
    .from("outbound_invoices")
    .select("payment_history")
    .eq("id", invoice.id)
    .single();

  const currentHistory = Array.isArray(fullInvoice?.payment_history)
    ? fullInvoice.payment_history
    : [];
  const updatedHistory = [...currentHistory, paymentRecord];
  const newPaidAmount = previouslyPaid + amountPaidCents;

  const isFullyPaid = newPaidAmount >= totalCents;

  const { error: updateError } = await admin
    .from("outbound_invoices")
    .update({
      paid_amount_cents: newPaidAmount,
      payment_method: "square_online",
      payment_reference: squarePaymentId ?? "square_online_payment",
      payment_date: today,
      payment_history: updatedHistory,
      status: isFullyPaid ? "paid" : "partially_paid",
    })
    .eq("id", invoice.id);

  if (updateError) {
    console.error("Invoice callback: failed to update invoice", updateError);
    return NextResponse.redirect(
      new URL("/client?error=payment_failed", req.url)
    );
  }

  // Log activity
  await admin.from("activity_log").insert({
    user_id: null,
    action: "outbound_invoice_paid_online",
    entity_type: "outbound_invoice",
    entity_id: invoice.id,
    metadata: {
      invoice_number: invoiceNumber,
      amount_cents: amountPaidCents,
      square_payment_id: squarePaymentId,
    },
  });

  const centreName =
    (invoice.centres as unknown as { name: string })?.name ?? "Unknown";

  // Notify admin/ops
  await triggerNotificationForOps({
    type: "invoice_status_changed",
    title: "Invoice payment received",
    body: `${centreName} paid invoice ${invoiceNumber} online via Square ($${(amountPaidCents / 100).toFixed(2)})`,
    entityType: "outbound_invoice",
    entityId: invoice.id,
  });

  // Redirect to a success page
  return NextResponse.redirect(
    new URL(
      `/client?payment=success&invoice=${invoiceNumber}&amount=${(amountPaidCents / 100).toFixed(2)}`,
      req.url
    )
  );
}
