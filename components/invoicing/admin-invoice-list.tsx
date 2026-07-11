"use client";

// ============================================================
// AdminInvoiceList — coach-invoice table for /admin/invoicing
// ============================================================
//
// Refreshed under the financial close-out pass:
//   - URL-persisted status + coach filter chips
//   - Bulk-select with sticky action bar (admin: mark paid +
//     export; admin/ops: resolve flagged + export)
//   - Mobile-responsive card view under md
//   - rounded-2xl, restrained orange, hover-lift, useCountUp totals

import { useState, useTransition, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Download,
  CheckCircle,
  Loader2,
  Receipt,
  X,
} from "lucide-react";
import {
  markInvoicePaid,
  bulkMarkInvoicesPaid,
  bulkResolveFlaggedInvoices,
  exportInvoicesCsv,
} from "@/lib/invoicing/actions";
import { INVOICE_STATUS_CONFIG } from "@/lib/utils/invoicing";
import { toast } from "sonner";
import { useCountUp } from "@/components/launch/use-count-up";
import type { InvoiceWithCoach } from "@/lib/invoicing/actions";
import type { CoachInvoiceStatus } from "@/lib/types/enums";

interface Props {
  invoices: InvoiceWithCoach[];
  showMarkPaid: boolean;
  /** "/admin/invoicing" or "/ops/invoicing" — URL persistence base. */
  basePath?: string;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function AdminInvoiceList({
  invoices,
  showMarkPaid,
  basePath = "/admin/invoicing",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const statusFilter = searchParams.get("status") ?? "all";
  const coachFilter = searchParams.get("coach") ?? "all";

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Unique coaches for filter
  const coaches = useMemo(
    () =>
      Array.from(
        new Map(invoices.map((i) => [i.coach_id, i.coach_name])).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );

  const filtered = useMemo(
    () =>
      invoices.filter((inv) => {
        if (statusFilter !== "all" && inv.status !== statusFilter) return false;
        if (coachFilter !== "all" && inv.coach_id !== coachFilter) return false;
        return true;
      }),
    [invoices, statusFilter, coachFilter],
  );

  const totalAmount = useMemo(
    () => filtered.reduce((s, i) => s + Number(i.total_amount ?? 0), 0),
    [filtered],
  );
  const totalAnimated = useCountUp(Math.round(totalAmount));

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((i) => i.id)),
    );
  }, [filtered]);

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

  const handleBulkMarkPaid = async () => {
    setBulkPending(true);
    const { paid, errors, error } = await bulkMarkInvoicesPaid(
      Array.from(selected),
    );
    setBulkPending(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (errors.length > 0) {
      toast.warning(`Marked ${paid} paid · ${errors.length} skipped`);
    } else {
      toast.success(`Marked ${paid} invoice${paid === 1 ? "" : "s"} paid.`);
    }
    setSelected(new Set());
    startTransition(() => router.refresh());
  };

  const handleBulkResolve = async () => {
    setBulkPending(true);
    const { resolved, errors, error } = await bulkResolveFlaggedInvoices(
      Array.from(selected),
      "Bulk-resolved without adjustments.",
    );
    setBulkPending(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (errors.length > 0) {
      toast.warning(`Resolved ${resolved} · ${errors.length} skipped`);
    } else {
      toast.success(
        `Resolved ${resolved} invoice${resolved === 1 ? "" : "s"}.`,
      );
    }
    setSelected(new Set());
    startTransition(() => router.refresh());
  };

  const handleExportCsv = async () => {
    setBulkPending(true);
    const ids =
      selected.size > 0 ? Array.from(selected) : filtered.map((i) => i.id);
    const { csv, error } = await exportInvoicesCsv(ids);
    setBulkPending(false);
    if (error || !csv) {
      toast.error(error ?? "Export failed.");
      return;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coach-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ids.length} invoice${ids.length === 1 ? "" : "s"}.`);
  };

  if (invoices.length === 0) {
    return (
      <Card className="rounded-2xl p-10 text-center">
        <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No coach invoices yet.</p>
      </Card>
    );
  }

  const hasFlaggedInSelection = Array.from(selected).some(
    (id) => invoices.find((i) => i.id === id)?.status === "flagged",
  );

  return (
    <div className="space-y-4">
      {/* Summary + filter chip row */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="rounded-2xl border bg-background px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total: </span>
          <span className="font-semibold text-foreground tabular-nums">
            ${totalAnimated.toLocaleString()}
          </span>
          <span className="ml-3 text-muted-foreground">
            {filtered.length} of {invoices.length}
          </span>
        </Card>

        <Select
          value={statusFilter}
          onValueChange={(v) => updateParam("status", v ?? "all")}
        >
          <SelectTrigger className="h-9 w-[160px] rounded-2xl">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(INVOICE_STATUS_CONFIG) as CoachInvoiceStatus[]).map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {INVOICE_STATUS_CONFIG[s].label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          value={coachFilter}
          onValueChange={(v) => updateParam("coach", v ?? "all")}
        >
          <SelectTrigger className="h-9 w-[200px] rounded-2xl">
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

        {(statusFilter !== "all" || coachFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              updateParam("status", "all");
              updateParam("coach", "all");
            }}
            className="text-muted-foreground"
          >
            <X className="size-3.5 mr-1" />
            Clear
          </Button>
        )}

        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            onClick={handleExportCsv}
            disabled={bulkPending}
          >
            <Download className="size-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 backdrop-blur px-4 py-2 shadow-sm">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          {showMarkPaid && (
            <Button
              size="sm"
              className="rounded-2xl bg-primary hover:bg-primary/90 text-white"
              onClick={handleBulkMarkPaid}
              disabled={bulkPending}
            >
              <CheckCircle className="size-4 mr-1" />
              Mark Paid
            </Button>
          )}
          {hasFlaggedInSelection && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-2xl"
              onClick={handleBulkResolve}
              disabled={bulkPending}
            >
              Resolve Flagged
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            <X className="size-4" />
            Clear
          </Button>
        </div>
      )}

      {/* Mobile cards under md */}
      <div className="grid gap-3 md:hidden">
        {filtered.map((inv) => {
          const status = INVOICE_STATUS_CONFIG[inv.status];
          return (
            <Card
              key={inv.id}
              className="rounded-2xl border p-4 transition card-hover hover:border-primary/40"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(inv.id)}
                  onCheckedChange={() => toggleSelect(inv.id)}
                  aria-label={`Select invoice for ${inv.coach_name}`}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {inv.coach_name}
                    </p>
                    <span className="text-base font-semibold tabular-nums">
                      ${inv.total_amount.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inv.invoice_number ?? "—"} ·{" "}
                    {formatPeriod(inv.period_start, inv.period_end)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge className={status.className}>{status.label}</Badge>
                    {inv.pdf_url && (
                      <a
                        href={inv.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-7 px-2",
                        )}
                      >
                        <Download className="size-3.5" />
                      </a>
                    )}
                    {showMarkPaid && inv.status === "sent" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-emerald-600"
                        onClick={() => handleMarkPaid(inv.id)}
                        disabled={payingId === inv.id}
                      >
                        {payingId === inv.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="size-3.5 mr-1" />
                            Paid
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Desktop table */}
      <Card className="hidden rounded-2xl md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    filtered.length > 0 && selected.size === filtered.length
                  }
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all visible invoices"
                />
              </TableHead>
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
              const isSelected = selected.has(inv.id);
              return (
                <TableRow
                  key={inv.id}
                  className={isSelected ? "bg-primary/5" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(inv.id)}
                      aria-label={`Select invoice for ${inv.coach_name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{inv.coach_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPeriod(inv.period_start, inv.period_end)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
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
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-8 w-8",
                          )}
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
    </div>
  );
}
