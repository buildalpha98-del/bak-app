"use client";

// ============================================================
// Coach payslip — printable breakdown of one coach_invoices row
// ============================================================
//
// Coaches land here from the invoice history list. Shows exactly how
// the pay was calculated: one line per session with rate + unit, then
// adjustments, GST, and the total. The Print button uses the browser's
// print dialog — #payslip-print scoping in globals.css hides the app
// shell so the printout is just the payslip.

import Link from "@/components/ui/app-link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { INVOICE_STATUS_CONFIG } from "@/lib/utils/invoicing";
import type { CoachInvoice } from "@/lib/types/database";

interface PayslipCoach {
  name: string | null;
  email: string;
  abn: string | null;
  gst_registered: boolean;
}

interface Props {
  invoice: CoachInvoice;
  coach: PayslipCoach;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

export function PayslipView({ invoice, coach }: Props) {
  const status = INVOICE_STATUS_CONFIG[invoice.status];
  const lineItems = invoice.line_items_json ?? [];

  // Recompute the sessions subtotal from the line items so the
  // breakdown is self-consistent: sessions + adjustments + GST = total.
  const sessionsSubtotal = lineItems.reduce((sum, i) => sum + i.amount, 0);
  const adjustments = invoice.adjustments ?? 0;
  const gst = invoice.gst_amount ?? 0;

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Toolbar — hidden in print */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/coach/invoicing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoicing
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print payslip
        </Button>
      </div>

      <div id="payslip-print">
        <Card className="rounded-2xl">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Build Alpha Kids
                </p>
                <h1 className="text-2xl font-bold font-heading text-foreground">
                  Payslip
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {invoice.invoice_number ?? "Draft"} ·{" "}
                  {fmtDate(invoice.period_start)} – {fmtDate(invoice.period_end)}
                </p>
              </div>
              <Badge className={status.className}>{status.label}</Badge>
            </div>

            {/* Coach details */}
            <div className="grid grid-cols-1 gap-4 rounded-xl bg-secondary/50 p-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Coach</p>
                <p className="font-medium text-foreground">
                  {coach.name ?? coach.email}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ABN</p>
                <p className="font-medium text-foreground">
                  {coach.abn ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">GST registered</p>
                <p className="font-medium text-foreground">
                  {coach.gst_registered ? "Yes" : "No"}
                </p>
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-secondary text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Centre</th>
                    <th className="px-4 py-2.5 text-left font-medium">Sport</th>
                    <th className="px-4 py-2.5 text-right font-medium">Mins</th>
                    <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((item) => (
                    <tr key={`${item.session_id}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                        {new Date(item.date + "T00:00:00").toLocaleDateString(
                          "en-AU",
                          { day: "numeric", month: "short" }
                        )}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5">
                        {item.centre_name}
                      </td>
                      <td className="px-4 py-2.5">{item.sport}</td>
                      <td className="px-4 py-2.5 text-right">
                        {item.duration_minutes}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">
                        {fmtMoney(item.rate)}
                        {item.rate_unit === "per_hour" ? "/hr" : "/session"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                        {fmtMoney(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {lineItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No line items on this invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Sessions ({lineItems.length})
                </span>
                <span className="font-medium">{fmtMoney(sessionsSubtotal)}</span>
              </div>
              {adjustments !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Adjustments
                    {invoice.adjustment_reason
                      ? ` — ${invoice.adjustment_reason}`
                      : ""}
                  </span>
                  <span className="font-medium">{fmtMoney(adjustments)}</span>
                </div>
              )}
              {gst > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST (10%)</span>
                  <span className="font-medium">{fmtMoney(gst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1.5 text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-foreground">
                  {fmtMoney(invoice.total_amount)}
                </span>
              </div>
            </div>

            {/* Payment details */}
            {invoice.status === "paid" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="font-medium text-emerald-800">
                  Paid
                  {invoice.payment_date
                    ? ` on ${fmtDate(invoice.payment_date)}`
                    : ""}
                </p>
                <p className="mt-0.5 text-emerald-700">
                  {invoice.payment_method
                    ? invoice.payment_method.replace(/_/g, " ")
                    : ""}
                  {invoice.payment_reference
                    ? ` · ref ${invoice.payment_reference}`
                    : ""}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Generated by Build Alpha Kids
              {invoice.payment_batch_id ? " · fortnightly payment batch" : ""}.
              Questions about this payslip? Message the ops team from your
              dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
