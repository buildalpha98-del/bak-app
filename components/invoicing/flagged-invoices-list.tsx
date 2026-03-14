"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, AlertTriangle } from "lucide-react";
import { FlagReviewSheet } from "./flag-review-sheet";
import type { InvoiceWithCoach } from "@/lib/invoicing/actions";
import type { FlaggedItem } from "@/lib/utils/invoicing";

interface Props {
  invoices: InvoiceWithCoach[];
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function FlaggedInvoicesList({ invoices }: Props) {
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithCoach | null>(
    null
  );

  if (invoices.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Flag className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No flagged invoices to review.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {invoices.map((inv) => {
          const flags = (inv.flagged_items_json ?? []) as unknown as FlaggedItem[];
          return (
            <Card
              key={inv.id}
              className="p-4 cursor-pointer hover:border-amber-300 transition-colors card-hover"
              onClick={() => setSelectedInvoice(inv)}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {inv.coach_name}
                    </p>
                    <Badge className="bg-amber-100 text-amber-700">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {flags.length} flag{flags.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inv.invoice_number} · {formatPeriod(inv.period_start, inv.period_end)}
                  </p>
                </div>
                <p className="text-sm font-bold text-foreground">
                  ${inv.total_amount.toFixed(2)}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <FlagReviewSheet
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
    </>
  );
}
