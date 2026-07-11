"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, DollarSign, Edit2 } from "lucide-react";
import {
  calculatePeriodPayroll,
  adjustInvoice,
  approvePaymentBatch,
  markBatchAsPaid,
} from "@/lib/invoicing/payroll-actions";
import type { PaymentBatch } from "@/lib/types/database";
import type { BatchInvoiceRow } from "@/lib/invoicing/payroll-actions";

interface Props {
  batch: PaymentBatch;
  invoices: BatchInvoiceRow[];
}

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return `${s.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
}

function batchStatusBadge(status: string) {
  const colors: Record<string, string> = {
    calculating: "bg-gray-100 text-gray-700",
    calculated: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-500",
  };
  return <Badge className={colors[status] ?? ""}>{status}</Badge>;
}

function invoiceStatusBadge(status: string) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    flagged: "bg-amber-100 text-amber-700",
    ready: "bg-emerald-100 text-emerald-700",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
  };
  return <Badge className={colors[status] ?? ""}>{status}</Badge>;
}

export function PayrollBatchDetail({ batch, invoices }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Adjust dialog
  const [adjustingInvoice, setAdjustingInvoice] = useState<BatchInvoiceRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Mark paid dialog
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "other">("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");

  function handleCalculate() {
    startTransition(async () => {
      const { data, error } = await calculatePeriodPayroll({ batchId: batch.id });
      if (error) { toast.error(error); return; }
      toast.success(`${data?.invoicesCreated ?? 0} invoices created, total ${formatAUD(data?.totalAmount ?? 0)}`);
      router.refresh();
    });
  }

  function handleSubmitAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingInvoice) return;
    const amount = Number(adjustAmount);
    if (isNaN(amount)) { toast.error("Invalid amount"); return; }
    startTransition(async () => {
      const { error } = await adjustInvoice({
        invoiceId: adjustingInvoice.id,
        adjustments: amount,
        reason: adjustReason,
      });
      if (error) { toast.error(error); return; }
      toast.success("Adjustment applied");
      setAdjustingInvoice(null);
      setAdjustAmount(""); setAdjustReason("");
      router.refresh();
    });
  }

  function handleApprove() {
    startTransition(async () => {
      const { data, error } = await approvePaymentBatch({ batchId: batch.id });
      if (error) { toast.error(error); return; }
      toast.success(`${data?.approved ?? 0} invoices approved. Coaches notified.`);
      router.refresh();
    });
  }

  function handleSubmitMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const { data, error } = await markBatchAsPaid({
        batchId: batch.id,
        paymentDate,
        paymentMethod,
        paymentReference: paymentReference || undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success(`${data?.markedPaid ?? 0} invoices marked as paid`);
      setMarkPaidOpen(false);
      router.refresh();
    });
  }

  const totalSubtotal = invoices.reduce((s, i) => s + i.subtotal, 0);
  const totalAdjustments = invoices.reduce((s, i) => s + Number(i.adjustments), 0);
  const grandTotal = invoices.reduce((s, i) => s + Number(i.total_amount), 0);

  // $0 lines mean a coach has no pay rate for that session — silently
  // underpays if approved. Surface per-invoice and batch-wide.
  const zeroLineCount = (inv: BatchInvoiceRow) =>
    (inv.line_items_json ?? []).filter((li) => Number(li.amount) === 0).length;
  const zeroRateInvoices = invoices.filter((inv) => zeroLineCount(inv) > 0);
  const zeroRateLines = zeroRateInvoices.reduce((s, inv) => s + zeroLineCount(inv), 0);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" render={<Link href="/admin/payroll" />}>
        <ArrowLeft className="size-4" />
        Back to Payroll
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">
            {formatPeriod(batch.period_start, batch.period_end)}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {batchStatusBadge(batch.status)}
            <span className="text-sm text-muted-foreground">
              {batch.coach_count} coach{batch.coach_count !== 1 ? "es" : ""} · {formatAUD(Number(batch.total_amount))}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {batch.status === "calculating" && (
            <Button onClick={handleCalculate} disabled={isPending}>
              <Calculator className="size-4 mr-1" />
              Calculate Payroll
            </Button>
          )}
          {batch.status === "calculated" && (
            <Button onClick={handleApprove} disabled={isPending}>
              <CheckCircle2 className="size-4 mr-1" />
              Approve & Notify Coaches
            </Button>
          )}
          {(batch.status === "approved" || batch.status === "calculated") && invoices.length > 0 && (
            <Button onClick={() => setMarkPaidOpen(true)} variant="outline" disabled={isPending}>
              <DollarSign className="size-4 mr-1" />
              Mark as Paid
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Subtotal</p>
            <p className="text-2xl font-bold">{formatAUD(totalSubtotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Adjustments</p>
            <p className={`text-2xl font-bold ${totalAdjustments < 0 ? "text-red-600" : totalAdjustments > 0 ? "text-green-600" : ""}`}>
              {formatAUD(totalAdjustments)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Grand Total</p>
            <p className="text-2xl font-bold text-primary">{formatAUD(grandTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coach Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {zeroRateInvoices.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                {zeroRateLines} session line{zeroRateLines === 1 ? "" : "s"} across{" "}
                {zeroRateInvoices.length} invoice{zeroRateInvoices.length === 1 ? "" : "s"} ha
                {zeroRateLines === 1 ? "s" : "ve"} a $0 pay rate. Set the coach&apos;s rate in
                Staff → Pay Rates, then Calculate Payroll again before approving.
              </p>
            </div>
          )}
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No invoices yet. Click "Calculate Payroll" to generate invoices for all coaches with completed sessions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">Coach</th>
                    <th className="text-right py-2 pr-4">Sessions</th>
                    <th className="text-right py-2 pr-4">Hours</th>
                    <th className="text-right py-2 pr-4">Subtotal</th>
                    <th className="text-right py-2 pr-4">Adjust.</th>
                    <th className="text-right py-2 pr-4">Total</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{inv.coach_name}</p>
                        <p className="text-xs text-muted-foreground">{inv.coach_email}</p>
                        {zeroLineCount(inv) > 0 && (
                          <Badge className="mt-1 bg-amber-100 text-amber-800">
                            {zeroLineCount(inv)} line{zeroLineCount(inv) === 1 ? "" : "s"} missing rate
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">{inv.total_sessions}</td>
                      <td className="py-3 pr-4 text-right">{inv.total_hours}</td>
                      <td className="py-3 pr-4 text-right">{formatAUD(inv.subtotal)}</td>
                      <td className="py-3 pr-4 text-right">
                        {Number(inv.adjustments) !== 0 ? (
                          <span className={Number(inv.adjustments) < 0 ? "text-red-600" : "text-green-600"}>
                            {formatAUD(Number(inv.adjustments))}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium">{formatAUD(Number(inv.total_amount))}</td>
                      <td className="py-3 pr-4">{invoiceStatusBadge(inv.status)}</td>
                      <td className="py-3 text-right">
                        {(batch.status === "calculated" || batch.status === "approved") && inv.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setAdjustingInvoice(inv);
                              setAdjustAmount(String(inv.adjustments));
                              setAdjustReason(inv.adjustment_reason ?? "");
                            }}
                          >
                            <Edit2 className="size-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust dialog */}
      <Dialog open={!!adjustingInvoice} onOpenChange={(open) => { if (!open) setAdjustingInvoice(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Payment</DialogTitle>
            <DialogDescription>
              Add a bonus (positive) or deduction (negative) for {adjustingInvoice?.coach_name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitAdjust} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (AUD)</Label>
              <Input
                type="number"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="50.00 (bonus) or -25.00 (deduction)"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Performance bonus, travel reimbursement, equipment deduction"
                rows={2}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdjustingInvoice(null)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save Adjustment"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark paid dialog */}
      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Batch as Paid</DialogTitle>
            <DialogDescription>
              Mark all {invoices.length} invoices in this batch as paid
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitMarkPaid} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => { if (v) setPaymentMethod(v as typeof paymentMethod); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference (optional)</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. PAYROLL-26-04-19"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMarkPaidOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Marking…" : "Mark as Paid"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
