"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Receipt } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INVOICE_STATUS_CONFIG } from "@/lib/utils/invoicing";
import type { CoachInvoice } from "@/lib/types/database";

interface Props {
  invoices: CoachInvoice[];
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function InvoiceHistoryList({ invoices }: Props) {
  if (invoices.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const status = INVOICE_STATUS_CONFIG[inv.status];
        return (
          <Card key={inv.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {inv.invoice_number ?? "Draft"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatPeriod(inv.period_start, inv.period_end)}
                </p>
                {inv.sent_at && (
                  <p className="text-xs text-muted-foreground">
                    Sent{" "}
                    {new Date(inv.sent_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={status.className}>{status.label}</Badge>
                <p className="text-sm font-bold text-foreground">
                  ${inv.total_amount.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 border-t pt-3">
              <Link
                href={`/coach/invoicing/${inv.id}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "flex-1"
                )}
              >
                <Receipt className="mr-2 h-3.5 w-3.5" /> View payslip
              </Link>
              {inv.pdf_url && (
                <a
                  href={inv.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "flex-1"
                  )}
                >
                  <Download className="mr-2 h-3.5 w-3.5" /> PDF
                </a>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
