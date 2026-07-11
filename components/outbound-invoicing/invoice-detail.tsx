"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Send,
  CheckCircle,
  XCircle,
  DollarSign,
  FileDown,
  Ban,
  Clock,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateOutboundLineItems,
  submitForApproval,
  approveInvoice,
  rejectInvoice,
  sendInvoice,
  recordPayment,
  voidInvoice,
} from "@/lib/outbound-invoicing/actions";
import type {
  OutboundInvoice,
  OutboundLineItem,
  Centre,
  InvoicePaymentRecord,
} from "@/lib/types/database";
import type { InvoicePaymentMethod } from "@/lib/types/enums";
import { InvoiceGrantBanner } from "@/components/grants/invoice-grant-banner";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-secondary text-foreground" },
  pending_approval: {
    label: "Pending Approval",
    className: "bg-amber-100 text-amber-800",
  },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Sent", className: "bg-purple-100 text-purple-800" },
  partially_paid: {
    label: "Partially Paid",
    className: "bg-orange-100 text-orange-800",
  },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  void: { label: "Void", className: "bg-gray-100 text-gray-500" },
};

interface Props {
  invoice: OutboundInvoice & { centre: Centre };
  userRole: "admin" | "ops";
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InvoiceDetail({ invoice, userRole }: Props) {
  const [lineItems, setLineItems] = useState<OutboundLineItem[]>(
    invoice.line_items_json
  );
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Payment form state
  const remainingCents =
    (invoice.total_cents ?? 0) - (invoice.paid_amount_cents ?? 0);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentAmount, setPaymentAmount] = useState(
    (remainingCents / 100).toFixed(2)
  );
  const [paymentMethod, setPaymentMethod] =
    useState<InvoicePaymentMethod>("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const isDraft = invoice.status === "draft";
  const isPending = invoice.status === "pending_approval";
  const isApproved = invoice.status === "approved";
  const isPayable =
    invoice.status === "sent" ||
    invoice.status === "partially_paid" ||
    invoice.status === "overdue";
  const canVoid =
    userRole === "admin" &&
    invoice.status !== "paid" &&
    invoice.status !== "void";

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

  function refreshPage() {
    window.location.reload();
  }

  async function handleSave() {
    setLoading(true);
    const { error } = await updateOutboundLineItems(invoice.id, lineItems);
    if (error) toast.error(error);
    else {
      toast.success("Line items saved.");
      refreshPage();
    }
    setLoading(false);
  }

  async function handleSubmit() {
    setLoading(true);
    const { error } = await submitForApproval(invoice.id);
    if (error) toast.error(error);
    else {
      toast.success("Submitted for approval.");
      refreshPage();
    }
    setLoading(false);
  }

  async function handleApprove() {
    setLoading(true);
    const { error } = await approveInvoice(invoice.id);
    if (error) toast.error(error);
    else {
      toast.success("Invoice approved.");
      refreshPage();
    }
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
    else {
      toast.success("Invoice rejected and returned to draft.");
      refreshPage();
    }
    setLoading(false);
    setShowRejectInput(false);
  }

  async function handleSendInvoice() {
    setLoading(true);
    const { error } = await sendInvoice(invoice.id);
    if (error) toast.error(error);
    else {
      toast.success("Invoice sent.");
      refreshPage();
    }
    setLoading(false);
  }

  async function handleRecordPayment() {
    const amountDollars = parseFloat(paymentAmount);
    if (isNaN(amountDollars) || amountDollars <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    const amountCents = Math.round(amountDollars * 100);

    setLoading(true);
    const { error } = await recordPayment(invoice.id, {
      date: paymentDate,
      amountCents,
      method: paymentMethod,
      reference: paymentReference || null,
      notes: paymentNotes || null,
    });
    if (error) toast.error(error);
    else {
      toast.success("Payment recorded.");
      setShowPaymentForm(false);
      refreshPage();
    }
    setLoading(false);
  }

  async function handleVoidInvoice() {
    const reason = prompt("Please provide a reason for voiding this invoice:");
    if (!reason) return;
    setLoading(true);
    const { error } = await voidInvoice(invoice.id, reason);
    if (error) toast.error(error);
    else {
      toast.success("Invoice voided.");
      refreshPage();
    }
    setLoading(false);
  }

  const paymentHistory = invoice.payment_history ?? [];

  return (
    <div className="space-y-6">
      {/* Grant allocation banner (schools only) */}
      <InvoiceGrantBanner
        invoiceId={invoice.id}
        centreId={invoice.centre_id}
        centreType={invoice.centre.type}
        invoiceTotal={(invoice.total_cents ?? 0) / 100}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {invoice.invoice_number ?? "Draft Invoice"}
          </h2>
          <p className="text-muted-foreground">
            {invoice.centre.name} —{" "}
            {invoice.centre.primary_contact_email ?? "No email"}
          </p>
          <p className="text-sm text-muted-foreground">
            Period:{" "}
            {new Date(invoice.period_start).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            })}
            {" — "}
            {new Date(invoice.period_end).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          {invoice.due_date && (
            <p className="text-sm text-muted-foreground">
              <Clock className="inline h-3.5 w-3.5 mr-1" />
              Due: {formatDate(invoice.due_date)}
            </p>
          )}
        </div>
        <Badge className={style.className}>{style.label}</Badge>
      </div>

      {/* Payment status info */}
      {invoice.total_cents != null && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <p className="text-lg font-semibold">
                {formatCurrency(invoice.subtotal_cents ?? invoice.total_cents ?? 0)}
              </p>
            </CardContent>
          </Card>
          {invoice.gst_amount_cents != null && invoice.gst_amount_cents > 0 && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">GST</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(invoice.gst_amount_cents)}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-semibold">
                {formatCurrency(invoice.total_cents)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="text-lg font-semibold text-green-700">
                {formatCurrency(invoice.paid_amount_cents ?? 0)}
              </p>
            </CardContent>
          </Card>
          {remainingCents > 0 && invoice.status !== "void" && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-semibold text-red-700">
                  {formatCurrency(remainingCents)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
                  {new Date(item.date).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td className="px-4 py-3">{item.sport}</td>
                <td className="px-4 py-3">{item.coach_name}</td>
                <td className="px-4 py-3 text-right">
                  {item.headcount ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  ${item.rate.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  {isDraft ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) =>
                        handleAmountChange(index, e.target.value)
                      }
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
              <td
                colSpan={5}
                className="px-4 py-3 font-semibold text-right"
              >
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

      {/* PDF Download */}
      {invoice.pdf_url && (
        <div>
          <a
            href={invoice.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <FileDown className="h-4 w-4" />
            Download PDF
          </a>
        </div>
      )}

      {/* Payment history */}
      {paymentHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-right px-4 py-2 font-medium">
                      Amount
                    </th>
                    <th className="text-left px-4 py-2 font-medium">Method</th>
                    <th className="text-left px-4 py-2 font-medium">
                      Reference
                    </th>
                    <th className="text-left px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paymentHistory.map(
                    (payment: InvoicePaymentRecord, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-muted-foreground">
                          {formatDate(payment.date)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatCurrency(payment.amount_cents)}
                        </td>
                        <td className="px-4 py-2 capitalize">
                          {payment.method.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {payment.reference ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {payment.notes ?? "—"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Payment Form */}
      {showPaymentForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Payment Date
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Amount ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as InvoicePaymentMethod)
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="square_online">Square Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Reference
                </label>
                <Input
                  type="text"
                  placeholder="e.g. BSB-Account or transaction ID"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notes (optional)
                </label>
                <Input
                  type="text"
                  placeholder="Any additional notes..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleRecordPayment}
                className="bg-green-600 hover:bg-green-700"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Record Payment
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPaymentForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {isDraft && (
          <>
            <Button onClick={handleSave} variant="outline" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Changes
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-primary hover:bg-primary/90"
              disabled={loading}
            >
              <Send className="mr-2 h-4 w-4" />
              Submit for Approval
            </Button>
          </>
        )}

        {isPending && userRole === "admin" && (
          <>
            <Button
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700"
              disabled={loading}
            >
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
                <Button
                  onClick={handleReject}
                  variant="destructive"
                  disabled={loading}
                >
                  Confirm Reject
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowRejectInput(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setShowRejectInput(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </>
        )}

        {isApproved && (
          <Button
            onClick={handleSendInvoice}
            className="bg-primary hover:bg-primary/90"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send Invoice
          </Button>
        )}

        {isPayable && !showPaymentForm && (
          <Button
            onClick={() => setShowPaymentForm(true)}
            className="bg-green-600 hover:bg-green-700"
            disabled={loading}
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        )}

        {canVoid && (
          <Button
            variant="destructive"
            onClick={handleVoidInvoice}
            disabled={loading}
          >
            <Ban className="mr-2 h-4 w-4" />
            Void Invoice
          </Button>
        )}
      </div>
    </div>
  );
}
