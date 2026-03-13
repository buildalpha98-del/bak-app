"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { OutboundInvoiceWithCentre } from "@/lib/outbound-invoicing/actions";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-800" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

interface Props {
  invoices: OutboundInvoiceWithCentre[];
  basePath: string;
}

export function OutboundInvoiceList({ invoices, basePath }: Props) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-[#666666]">
        No outbound invoices found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#F5F5F5]">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Invoice #</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Centre</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Period</th>
            <th className="text-right px-4 py-3 font-medium text-[#1A1A1A]">Amount</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Status</th>
            <th className="text-left px-4 py-3 font-medium text-[#1A1A1A]">Sent</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {invoices.map((invoice) => {
            const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft;
            return (
              <tr key={invoice.id} className="hover:bg-[#F5F5F5] cursor-pointer">
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/${invoice.id}`}
                    className="text-[#E8712A] hover:underline font-medium"
                  >
                    {invoice.invoice_number ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[#1A1A1A]">{invoice.centre_name}</td>
                <td className="px-4 py-3 text-[#666666]">
                  {new Date(invoice.period_start).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  {" — "}
                  {new Date(invoice.period_end).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">
                  ${invoice.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={style.className}>{style.label}</Badge>
                </td>
                <td className="px-4 py-3 text-[#666666]">
                  {invoice.sent_at
                    ? new Date(invoice.sent_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
