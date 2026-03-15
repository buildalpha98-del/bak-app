"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileSpreadsheet, DollarSign, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  getInvoiceRegister,
  getPaymentRegister,
  getGstSummary,
} from "@/lib/outbound-invoicing/actions";
import type {
  InvoiceRegisterRow,
  PaymentRegisterRow,
  GstSummaryRow,
} from "@/lib/outbound-invoicing/actions";

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

function buildInvoiceRegisterCsv(rows: InvoiceRegisterRow[]): string {
  const header =
    "Invoice Number,Centre,Period Start,Period End,Subtotal,GST,Total,Status,Sent Date,Due Date,Paid";
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.invoice_number),
      escapeCsvField(r.centre_name),
      escapeCsvField(r.period_start),
      escapeCsvField(r.period_end),
      centsToDisplay(r.subtotal_cents),
      centsToDisplay(r.gst_amount_cents),
      centsToDisplay(r.total_cents),
      escapeCsvField(r.status),
      escapeCsvField(r.sent_at),
      escapeCsvField(r.due_date),
      centsToDisplay(r.paid_amount_cents),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

function buildPaymentRegisterCsv(rows: PaymentRegisterRow[]): string {
  const header =
    "Invoice Number,Centre,Payment Date,Amount,Method,Reference";
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.invoice_number),
      escapeCsvField(r.centre_name),
      escapeCsvField(r.payment_date),
      centsToDisplay(r.amount_cents),
      escapeCsvField(r.method),
      escapeCsvField(r.reference),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

function buildGstSummaryCsv(rows: GstSummaryRow[]): string {
  const header =
    "Invoice Number,Centre,Period Start,Period End,Subtotal (ex GST),GST,Total (inc GST)";
  const lines = rows.map((r) =>
    [
      escapeCsvField(r.invoice_number),
      escapeCsvField(r.centre_name),
      escapeCsvField(r.period_start),
      escapeCsvField(r.period_end),
      centsToDisplay(r.subtotal_cents),
      centsToDisplay(r.gst_amount_cents),
      centsToDisplay(r.total_cents),
    ].join(",")
  );

  // Add totals row
  const totalSubtotal = rows.reduce((s, r) => s + r.subtotal_cents, 0);
  const totalGst = rows.reduce((s, r) => s + r.gst_amount_cents, 0);
  const totalTotal = rows.reduce((s, r) => s + r.total_cents, 0);
  const totalsLine = [
    "TOTALS",
    "",
    "",
    "",
    centsToDisplay(totalSubtotal),
    centsToDisplay(totalGst),
    centsToDisplay(totalTotal),
  ].join(",");

  return [header, ...lines, totalsLine].join("\n");
}

export default function AccountantExportPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [periodStart, setPeriodStart] = useState(
    firstOfMonth.toISOString().split("T")[0]
  );
  const [periodEnd, setPeriodEnd] = useState(
    today.toISOString().split("T")[0]
  );
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [loadingGst, setLoadingGst] = useState(false);

  async function handleExportInvoiceRegister() {
    setLoadingInvoice(true);
    const { data, error } = await getInvoiceRegister(periodStart, periodEnd);
    if (error || !data) {
      toast.error(error ?? "Failed to fetch invoice register.");
      setLoadingInvoice(false);
      return;
    }
    if (data.length === 0) {
      toast.error("No invoices found in the selected period.");
      setLoadingInvoice(false);
      return;
    }
    const csv = buildInvoiceRegisterCsv(data);
    downloadCsv(`invoice-register-${periodStart}-to-${periodEnd}.csv`, csv);
    toast.success(`Exported ${data.length} invoices.`);
    setLoadingInvoice(false);
  }

  async function handleExportPaymentRegister() {
    setLoadingPayment(true);
    const { data, error } = await getPaymentRegister(periodStart, periodEnd);
    if (error || !data) {
      toast.error(error ?? "Failed to fetch payment register.");
      setLoadingPayment(false);
      return;
    }
    if (data.length === 0) {
      toast.error("No payments found in the selected period.");
      setLoadingPayment(false);
      return;
    }
    const csv = buildPaymentRegisterCsv(data);
    downloadCsv(`payment-register-${periodStart}-to-${periodEnd}.csv`, csv);
    toast.success(`Exported ${data.length} payment records.`);
    setLoadingPayment(false);
  }

  async function handleExportGstSummary() {
    setLoadingGst(true);
    const { data, error } = await getGstSummary(periodStart, periodEnd);
    if (error || !data) {
      toast.error(error ?? "Failed to fetch GST summary.");
      setLoadingGst(false);
      return;
    }
    if (data.length === 0) {
      toast.error("No GST data found in the selected period.");
      setLoadingGst(false);
      return;
    }
    const csv = buildGstSummaryCsv(data);
    downloadCsv(`gst-summary-${periodStart}-to-${periodEnd}.csv`, csv);
    toast.success(`Exported GST summary for ${data.length} invoices.`);
    setLoadingGst(false);
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Accountant Export
        </h1>
        <p className="text-sm text-muted-foreground">
          Export invoice and payment data as CSV for your accountant or
          bookkeeper.
        </p>
      </div>

      {/* Date range filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Period Start
              </label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Period End
              </label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export buttons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-[#E8712A]" />
              Invoice Register
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All invoices within the selected period including amounts, status,
              and payment info.
            </p>
            <Button
              onClick={handleExportInvoiceRegister}
              className="w-full bg-primary hover:bg-primary/90"
              disabled={loadingInvoice}
            >
              {loadingInvoice ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Export Invoice Register
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-green-600" />
              Payment Register
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All payments received within the selected period with method and
              reference details.
            </p>
            <Button
              onClick={handleExportPaymentRegister}
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={loadingPayment}
            >
              {loadingPayment ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="mr-2 h-4 w-4" />
              )}
              Export Payment Register
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-blue-600" />
              GST Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              GST collected on invoices within the selected period, with totals
              for BAS reporting.
            </p>
            <Button
              onClick={handleExportGstSummary}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loadingGst}
            >
              {loadingGst ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Receipt className="mr-2 h-4 w-4" />
              )}
              Export GST Summary
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
