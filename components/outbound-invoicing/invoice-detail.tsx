"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, CheckCircle, XCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  updateOutboundLineItems,
  submitForApproval,
  approveInvoice,
  rejectInvoice,
} from "@/lib/outbound-invoicing/actions";
import { pushInvoiceToQuickBooks } from "@/lib/quickbooks/actions";
import type {
  OutboundInvoice,
  OutboundLineItem,
  Centre,
} from "@/lib/types/database";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-secondary text-foreground" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

interface Props {
  invoice: OutboundInvoice & { centre: Centre };
  userRole: "admin" | "ops";
  qbConnected: boolean;
}

export function InvoiceDetail({ invoice, userRole, qbConnected }: Props) {
  const [lineItems, setLineItems] = useState<OutboundLineItem[]>(
    invoice.line_items_json
  );
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isDraft = invoice.status === "draft";
  const isPending = invoice.status === "pending_approval";
  const isApproved = invoice.status === "approved";
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft;

  function handleAmountChange(index: number, newAmount: string) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], amount: parseFloat(newAmount) || 0 };
    setLineItems(updated);
  }

  function handleRemoveItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setLoading(true);
    const { error } = await updateOutboundLineItems(invoice.id, lineItems);
    if (error) toast.error(error);
    else toast.success("Line items saved.");
    setLoading(false);
  }

  async function handleSubmit() {
    setLoading(true);
    const { error } = await submitForApproval(invoice.id);
    if (error) toast.error(error);
    else toast.success("Submitted for approval.");
    setLoading(false);
  }

  async function handleApprove() {
    setLoading(true);
    const { error } = await approveInvoice(invoice.id);
    if (error) toast.error(error);
    else toast.success("Invoice approved.");
    setLoading(false);
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }
    setLoading(true);
    const { error } = await rejectInvoice(invoice.id, rejectReason);
    if (error) toast.error(error);
    else toast.success("Invoice rejected and returned to draft.");
    setLoading(false);
    setShowRejectInput(false);
  }

  async function handlePushToQB() {
    if (!invoice.centre.qb_customer_id) {
      toast.error("This centre has not been synced to QuickBooks. Please sync the centre first.");
      return;
    }
    setLoading(true);
    const { error } = await pushInvoiceToQuickBooks(invoice.id);
    if (error) toast.error(error);
    else toast.success("Invoice sent to QuickBooks.");
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {invoice.invoice_number ?? "Draft Invoice"}
          </h2>
          <p className="text-muted-foreground">
            {invoice.centre.name} — {invoice.centre.primary_contact_email ?? "No email"}
          </p>
          <p className="text-sm text-muted-foreground">
            Period:{" "}
            {new Date(invoice.period_start).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            {" — "}
            {new Date(invoice.period_end).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <Badge className={style.className}>{style.label}</Badge>
      </div>

      {/* Line items table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Sport</th>
              <th className="text-left px-4 py-3 font-medium">Coach</th>
              <th className="text-right px-4 py-3 font-medium">Attendance</th>
              <th className="text-right px-4 py-3 font-medium">Rate</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              {isDraft && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {lineItems.map((item, index) => (
              <tr key={item.session_id}>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(item.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-3">{item.sport}</td>
                <td className="px-4 py-3">{item.coach_name}</td>
                <td className="px-4 py-3 text-right">{item.headcount ?? "—"}</td>
                <td className="px-4 py-3 text-right">${item.rate.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  {isDraft ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => handleAmountChange(index, e.target.value)}
                      className="w-24 text-right h-8"
                    />
                  ) : (
                    `$${item.amount.toFixed(2)}`
                  )}
                </td>
                {isDraft && (
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-500 hover:text-red-700 h-8"
                    >
                      ×
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-secondary">
            <tr>
              <td colSpan={isDraft ? 5 : 5} className="px-4 py-3 font-semibold text-right">
                Total
              </td>
              <td className="px-4 py-3 text-right font-bold text-foreground">
                ${total.toFixed(2)}
              </td>
              {isDraft && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isDraft && (
          <>
            <Button onClick={handleSave} variant="outline" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90" disabled={loading}>
              <Send className="mr-2 h-4 w-4" />
              Submit for Approval
            </Button>
          </>
        )}

        {isPending && userRole === "admin" && (
          <>
            <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700" disabled={loading}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
            {showRejectInput ? (
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-64"
                />
                <Button onClick={handleReject} variant="destructive" disabled={loading}>
                  Confirm Reject
                </Button>
                <Button variant="ghost" onClick={() => setShowRejectInput(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setShowRejectInput(true)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </>
        )}

        {isApproved && qbConnected && (
          <Button onClick={handlePushToQB} className="bg-primary hover:bg-primary/90" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Send to QuickBooks
          </Button>
        )}
      </div>
    </div>
  );
}
