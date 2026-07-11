"use client";

// ============================================================
// Outbound invoice list — with bulk approve / send
// ============================================================
//
// Month-end means ~40 centres. Checkbox multi-select + a sticky
// action bar turn 40 open-click-send loops into two clicks. Only
// eligible rows are selectable per action: pending_approval →
// Approve, approved → Send.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bulkApproveInvoices,
  bulkSendInvoices,
} from "@/lib/outbound-invoicing/actions";
import type { OutboundInvoiceWithCentre } from "@/lib/outbound-invoicing/actions";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-secondary text-foreground" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-800" },
  partially_paid: { label: "Partially Paid", className: "bg-orange-100 text-orange-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  void: { label: "Void", className: "bg-gray-100 text-gray-500" },
};

const SELECTABLE = new Set(["pending_approval", "approved"]);

interface Props {
  invoices: OutboundInvoiceWithCentre[];
  basePath: string;
}

export function OutboundInvoiceList({ invoices, basePath }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [working, setWorking] = useState<"approve" | "send" | null>(null);

  const selectable = useMemo(
    () => invoices.filter((i) => SELECTABLE.has(i.status)),
    [invoices]
  );
  const selectedRows = invoices.filter((i) => selected.has(i.id));
  const approvable = selectedRows.filter((i) => i.status === "pending_approval");
  const sendable = selectedRows.filter((i) => i.status === "approved");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === selectable.length
        ? new Set()
        : new Set(selectable.map((i) => i.id))
    );
  }

  function runBulk(kind: "approve" | "send") {
    const ids = (kind === "approve" ? approvable : sendable).map((i) => i.id);
    if (ids.length === 0) return;
    setWorking(kind);
    startTransition(async () => {
      const result =
        kind === "approve"
          ? await bulkApproveInvoices(ids)
          : await bulkSendInvoices(ids);
      const ok = "approved" in result ? result.approved : result.sent;
      if (ok > 0) {
        toast.success(
          `${ok} invoice${ok === 1 ? "" : "s"} ${kind === "approve" ? "approved" : "sent"}.`
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} failed — first: ${result.failed[0].error}`
        );
      }
      setSelected(new Set());
      setWorking(null);
      router.refresh();
    });
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        No outbound invoices found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar — appears once anything is selected */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            disabled={isPending || approvable.length === 0}
            onClick={() => runBulk("approve")}
          >
            {working === "approve" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle className="mr-1 h-3.5 w-3.5" />
            )}
            Approve ({approvable.length})
          </Button>
          <Button
            size="sm"
            disabled={isPending || sendable.length === 0}
            onClick={() => runBulk("send")}
          >
            {working === "send" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Send ({sendable.length})
          </Button>
          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all actionable invoices"
                  checked={
                    selectable.length > 0 && selected.size === selectable.length
                  }
                  disabled={selectable.length === 0}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-primary"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium text-foreground">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium text-foreground">Centre</th>
              <th className="text-left px-4 py-3 font-medium text-foreground">Period</th>
              <th className="text-right px-4 py-3 font-medium text-foreground">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-foreground">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoices.map((invoice) => {
              const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft;
              const canSelect = SELECTABLE.has(invoice.status);
              return (
                <tr key={invoice.id} className="hover:bg-secondary">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select invoice ${invoice.invoice_number ?? invoice.id}`}
                      checked={selected.has(invoice.id)}
                      disabled={!canSelect}
                      onChange={() => toggle(invoice.id)}
                      className="h-4 w-4 accent-primary disabled:opacity-30"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`${basePath}/${invoice.id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {invoice.invoice_number ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">{invoice.centre_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(invoice.period_start).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    {" — "}
                    {new Date(invoice.period_end).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    ${invoice.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={style.className}>{style.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
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
    </div>
  );
}
