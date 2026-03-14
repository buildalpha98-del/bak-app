"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, CheckCircle, Loader2, Receipt } from "lucide-react";
import { markInvoicePaid } from "@/lib/invoicing/actions";
import { INVOICE_STATUS_CONFIG } from "@/lib/utils/invoicing";
import { toast } from "sonner";
import type { InvoiceWithCoach } from "@/lib/invoicing/actions";
import type { CoachInvoiceStatus } from "@/lib/types/enums";

interface Props {
  invoices: InvoiceWithCoach[];
  showMarkPaid: boolean;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function AdminInvoiceList({ invoices, showMarkPaid }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [payingId, setPayingId] = useState<string | null>(null);

  // Unique coaches for filter
  const coaches = Array.from(
    new Map(invoices.map((i) => [i.coach_id, i.coach_name])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = invoices.filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (coachFilter !== "all" && inv.coach_id !== coachFilter) return false;
    return true;
  });

  const handleMarkPaid = async (id: string) => {
    setPayingId(id);
    const { error } = await markInvoicePaid(id);
    setPayingId(null);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Invoice marked as paid.");
      startTransition(() => router.refresh());
    }
  };

  if (invoices.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No coach invoices yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(
              Object.keys(INVOICE_STATUS_CONFIG) as CoachInvoiceStatus[]
            ).map((s) => (
              <SelectItem key={s} value={s}>
                {INVOICE_STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={coachFilter} onValueChange={(v) => setCoachFilter(v ?? "")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Coaches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Coaches</SelectItem>
            {coaches.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coach</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((inv) => {
              const status = INVOICE_STATUS_CONFIG[inv.status];
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    {inv.coach_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPeriod(inv.period_start, inv.period_end)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${inv.total_amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge className={status.className}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {inv.pdf_url && (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download PDF"
                          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                      {showMarkPaid && inv.status === "sent" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleMarkPaid(inv.id)}
                          disabled={payingId === inv.id}
                        >
                          {payingId === inv.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="mr-1 h-3.5 w-3.5" /> Paid
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {invoices.length} invoices
      </p>
    </div>
  );
}
