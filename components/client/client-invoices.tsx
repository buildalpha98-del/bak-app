"use client";

import { Receipt, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountUp } from "@/components/launch/use-count-up";
import type { ClientInvoice } from "@/lib/client/portal-actions";

interface ClientInvoicesProps {
  invoices: (ClientInvoice & { pdf_url?: string | null })[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  const sameYear = startDate.getFullYear() === endDate.getFullYear();

  const startFormatted = startDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endFormatted = endDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${startFormatted} — ${endFormatted}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

function statusBadge(status: string) {
  switch (status) {
    case "paid":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200">
          Paid
        </Badge>
      );
    case "sent":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
          Sent
        </Badge>
      );
    case "overdue":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200">
          Overdue
        </Badge>
      );
    case "partially_paid":
      return (
        <Badge className="bg-orange-50 text-orange-700 border-orange-200">
          Partially Paid
        </Badge>
      );
    case "void":
      return (
        <Badge className="bg-gray-50 text-gray-500 border-gray-200">
          Void
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function ClientInvoices({ invoices }: ClientInvoicesProps) {
  if (invoices.length === 0) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Invoices
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0891B2]/10">
            <Receipt className="h-6 w-6 text-[#0891B2]" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-gray-900">
            No invoices yet
          </h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Invoices for coaching sessions at your centre will appear here once
            they have been sent.
          </p>
        </div>
      </div>
    );
  }

  // Totals for header summary
  const dollars = (invoice: ClientInvoice) =>
    invoice.total_cents != null ? invoice.total_cents / 100 : invoice.amount;
  const totalOutstanding = invoices
    .filter((inv) => ["sent", "partially_paid", "overdue"].includes(inv.status))
    .reduce((sum, inv) => sum + dollars(inv), 0);
  const outstandingTicked = useCountUp(Math.round(totalOutstanding));

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">
            Invoices
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invoice history for your centre.
          </p>
        </div>
        {totalOutstanding > 0 && (
          <div className="rounded-2xl border bg-background px-3 py-2 text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Outstanding
            </p>
            <p className="text-lg font-semibold tabular-nums text-[#0891B2]">
              {formatCurrency(outstandingTicked)}
            </p>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="mt-6 hidden overflow-hidden rounded-2xl border bg-card sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {invoice.invoice_number ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {formatPeriod(invoice.period_start, invoice.period_end)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatCurrency(invoice.total_cents != null ? invoice.total_cents / 100 : invoice.amount)}
                </td>
                <td className="px-4 py-3">{statusBadge(invoice.status)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {invoice.sent_at
                    ? formatDate(invoice.sent_at.split("T")[0])
                    : formatDate(invoice.created_at.split("T")[0])}
                </td>
                <td className="px-4 py-3">
                  {invoice.pdf_url ? (
                    <a
                      href={invoice.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm" className="h-8 px-2">
                        <FileDown className="h-4 w-4 text-[#0891B2]" />
                      </Button>
                    </a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="mt-6 space-y-3 sm:hidden">
        {invoices.map((invoice) => (
          <Card key={invoice.id} className="rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-gray-900">
                {invoice.invoice_number ?? "Invoice"}
              </CardTitle>
              {statusBadge(invoice.status)}
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Period</span>
                <span className="text-gray-700">
                  {formatPeriod(invoice.period_start, invoice.period_end)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(invoice.total_cents != null ? invoice.total_cents / 100 : invoice.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-700">
                  {invoice.sent_at
                    ? formatDate(invoice.sent_at.split("T")[0])
                    : formatDate(invoice.created_at.split("T")[0])}
                </span>
              </div>
              {invoice.pdf_url && (
                <div className="pt-1">
                  <a
                    href={invoice.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[#0891B2] hover:underline"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Download PDF
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
