"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { approveInvoice } from "@/lib/outbound-invoicing/actions";
import type { OutboundInvoiceWithCentre } from "@/lib/outbound-invoicing/actions";

interface Props {
  invoices: OutboundInvoiceWithCentre[];
}

export function ApprovalQueue({ invoices }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  if (invoices.length === 0) return null;

  async function handleApprove(invoiceId: string) {
    setLoading(invoiceId);
    const { error } = await approveInvoice(invoiceId);
    if (error) toast.error(error);
    else toast.success("Invoice approved.");
    setLoading(null);
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Badge className="bg-amber-100 text-amber-800">
          {invoices.length}
        </Badge>
        Invoices Pending Approval
      </h3>
      <div className="space-y-2">
        {invoices.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between bg-card rounded-md p-3 border"
          >
            <div>
              <Link
                href={`/admin/invoicing/outbound/${inv.id}`}
                className="font-medium text-primary hover:underline"
              >
                {inv.invoice_number}
              </Link>
              <span className="text-muted-foreground ml-2">{inv.centre_name}</span>
              <span className="text-muted-foreground ml-2 font-medium">
                ${inv.amount.toFixed(2)}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => handleApprove(inv.id)}
              disabled={loading === inv.id}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading === inv.id ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              Approve
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
