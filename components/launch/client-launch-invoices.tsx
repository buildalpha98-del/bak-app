"use client";

import { Receipt, FileDown, Eye } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInvoicePdfUrl } from "@/lib/launch/invoice-actions";
import type { InvoiceWithItems } from "@/lib/launch/invoice-actions";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

function statusBadge(status: string) {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-50 text-green-700 border-green-200">Paid</Badge>;
    case "sent":
      return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Sent</Badge>;
    case "overdue":
      return <Badge className="bg-red-50 text-red-700 border-red-200">Overdue</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

async function handlePdf(invoiceId: string) {
  const { url, error } = await getInvoicePdfUrl(invoiceId);
  if (error || !url) {
    toast.error(error || "PDF not available");
    return;
  }
  window.open(url, "_blank");
}

export function LaunchClientInvoices({
  invoices,
}: {
  invoices: InvoiceWithItems[];
}) {
  if (invoices.length === 0) return null;

  return (
    <div className="animate-fade-up">
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Issue Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoices.map((inv: InvoiceWithItems) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 font-mono text-xs">
                  {inv.invoice_number}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(inv.issue_date)}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(inv.due_date)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {fmt(Number(inv.total))}
                </td>
                <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => handlePdf(inv.id)}
                  >
                    <FileDown className="h-4 w-4 text-primary" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {invoices.map((inv: InvoiceWithItems) => (
          <Card key={inv.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-gray-900">
                {inv.invoice_number}
              </CardTitle>
              {statusBadge(inv.status)}
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Issue Date</span>
                <span className="text-gray-700">{formatDate(inv.issue_date)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Due Date</span>
                <span className="text-gray-700">{formatDate(inv.due_date)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-gray-900">
                  {fmt(Number(inv.total))}
                </span>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => handlePdf(inv.id)}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download PDF
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment reference info */}
      <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900 mb-1">Payment Details</p>
        <p>Please use your invoice number as the payment reference when making bank transfers.</p>
        <p className="mt-1 text-xs text-gray-500">
          Payment is due within 14 days of the invoice date. Contact us at{" "}
          <a href="mailto:info@buildalphakids.com.au" className="text-primary hover:underline">
            info@buildalphakids.com.au
          </a>{" "}
          if you have any questions.
        </p>
      </div>
    </div>
  );
}
