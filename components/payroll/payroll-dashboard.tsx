"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, ArrowRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { createOrGetPaymentBatch } from "@/lib/invoicing/payroll-actions";
import type { PaymentBatchWithStats } from "@/lib/invoicing/payroll-actions";

interface Props {
  batches: PaymentBatchWithStats[];
  error: string | null;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
}

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return `${s.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "calculating":
      return <Badge variant="outline"><Clock className="size-3 mr-1" />Calculating</Badge>;
    case "calculated":
      return <Badge variant="secondary"><AlertCircle className="size-3 mr-1" />Awaiting Approval</Badge>;
    case "approved":
      return <Badge variant="default"><CheckCircle2 className="size-3 mr-1" />Approved</Badge>;
    case "paid":
      return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="size-3 mr-1" />Paid</Badge>;
    case "closed":
      return <Badge variant="outline">Closed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function PayrollDashboard({ batches, error, currentPeriod, previousPeriod }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const previousBatch = batches.find(
    (b) => b.period_start === previousPeriod.start && b.period_end === previousPeriod.end
  );

  function handleCreateBatch(period: { start: string; end: string }) {
    startTransition(async () => {
      const { data, error } = await createOrGetPaymentBatch({
        periodStart: period.start,
        periodEnd: period.end,
      });
      if (error) { toast.error(error); return; }
      if (data) {
        toast.success("Batch created");
        router.push(`/admin/payroll/${data.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Payroll</p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Coach Payroll
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Batch-calculate, approve, and pay coach wages for each fortnightly period.
        </p>
      </div>

      {error && (
        <Card className="border-red-500/50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Current period action */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Previous Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{formatPeriod(previousPeriod.start, previousPeriod.end)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {previousBatch ? `Batch exists (${previousBatch.status})` : "No batch created yet"}
              </p>
            </div>
            {previousBatch ? (
              <Button variant="outline" render={<Link href={`/admin/payroll/${previousBatch.id}`} />}>
                Open Batch
                <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => handleCreateBatch(previousPeriod)} disabled={isPending}>
                <Plus className="size-4 mr-1" />
                Create Batch
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* All batches table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Payment Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No payment batches yet. Create one for the previous period to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">Period</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2 pr-4">Coaches</th>
                    <th className="text-right py-2 pr-4">Total</th>
                    <th className="text-left py-2 pr-4">Created By</th>
                    <th className="text-right py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="size-3.5 text-muted-foreground" />
                          {formatPeriod(b.period_start, b.period_end)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{statusBadge(b.status)}</td>
                      <td className="py-3 pr-4 text-right">{b.coach_count}</td>
                      <td className="py-3 pr-4 text-right font-medium">{formatAUD(Number(b.total_amount))}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{b.created_by_name ?? "—"}</td>
                      <td className="py-3 text-right">
                        <Button size="sm" variant="ghost" render={<Link href={`/admin/payroll/${b.id}`} />}>
                          View
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
