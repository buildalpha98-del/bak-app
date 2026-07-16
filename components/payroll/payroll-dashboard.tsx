"use client";

// ============================================================
// PayrollDashboard — refreshed under the financial close-out pass
// ============================================================
//
//   - URL-persisted status filter chips
//   - useCountUp on total paid YTD
//   - rounded-2xl, restrained orange CTAs, hover-lift, gap-6
//   - Mobile-responsive cards under md

import { useTransition, useMemo } from "react";
import Link from "@/components/ui/app-link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import { createOrGetPaymentBatch } from "@/lib/invoicing/payroll-actions";
import { useCountUp } from "@/components/launch/use-count-up";
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
      return (
        <Badge variant="outline">
          <Clock className="size-3 mr-1" />
          Calculating
        </Badge>
      );
    case "calculated":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <AlertCircle className="size-3 mr-1" />
          Awaiting Approval
        </Badge>
      );
    case "approved":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          <CheckCircle2 className="size-3 mr-1" />
          Approved
        </Badge>
      );
    case "paid":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="size-3 mr-1" />
          Paid
        </Badge>
      );
    case "closed":
      return <Badge variant="outline">Closed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function PayrollDashboard({
  batches,
  error,
  currentPeriod,
  previousPeriod,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const statusFilter = searchParams.get("status") ?? "all";

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const previousBatch = batches.find(
    (b) =>
      b.period_start === previousPeriod.start &&
      b.period_end === previousPeriod.end,
  );

  const filtered = useMemo(
    () =>
      batches.filter((b) =>
        statusFilter === "all" ? true : b.status === statusFilter,
      ),
    [batches, statusFilter],
  );

  // Total paid this year (simple sum of all 'paid' batches)
  const paidYtd = useMemo(() => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    return batches
      .filter((b) => b.status === "paid" && b.period_start >= yearStart)
      .reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
  }, [batches]);
  const paidYtdAnimated = useCountUp(Math.round(paidYtd));

  function handleCreateBatch(period: { start: string; end: string }) {
    startTransition(async () => {
      const { data, error } = await createOrGetPaymentBatch({
        periodStart: period.start,
        periodEnd: period.end,
      });
      if (error) {
        toast.error(error);
        return;
      }
      if (data) {
        toast.success("Batch created");
        router.push(`/admin/payroll/${data.id}`);
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Page header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Payroll
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
          Coach Payroll
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Batch-calculate, approve, and pay coach wages for each fortnightly period.
        </p>
      </div>

      {error && (
        <Card className="rounded-2xl border-red-500/50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary + previous-period CTA row */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-2xl card-hover md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Previous Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {formatPeriod(previousPeriod.start, previousPeriod.end)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {previousBatch
                    ? `Batch exists (${previousBatch.status})`
                    : "No batch created yet"}
                </p>
              </div>
              {previousBatch ? (
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  render={<Link href={`/admin/payroll/${previousBatch.id}`} />}
                >
                  Open Batch
                  <ArrowRight className="size-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => handleCreateBatch(previousPeriod)}
                  disabled={isPending}
                  className="rounded-2xl bg-primary hover:bg-primary/90 text-white"
                >
                  <Plus className="size-4 mr-1" />
                  Create Batch
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Current period:{" "}
              <span className="text-foreground">
                {formatPeriod(currentPeriod.start, currentPeriod.end)}
              </span>{" "}
              · auto-creates Monday after period end via cron.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl card-hover">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Paid YTD</p>
            <p className="text-2xl font-bold tabular-nums">
              ${paidYtdAnimated.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {batches.filter((b) => b.status === "paid").length} closed batches
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter chip row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => updateParam("status", v)}
        >
          <SelectTrigger className="h-9 w-[200px] rounded-2xl">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="calculating">Calculating</SelectItem>
            <SelectItem value="calculated">Awaiting Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "all" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateParam("status", null)}
            className="text-muted-foreground"
          >
            <X className="size-3.5 mr-1" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {batches.length}
        </span>
      </div>

      {/* All batches */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">All Payment Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {batches.length === 0
                ? "No payment batches yet. Create one for the previous period to get started."
                : "No batches match your filters."}
            </p>
          ) : (
            <>
              {/* Mobile cards under md */}
              <div className="grid gap-3 md:hidden">
                {filtered.map((b) => (
                  <Card
                    key={b.id}
                    className="rounded-2xl border p-4 transition card-hover hover:border-primary/40"
                  >
                    <Link
                      href={`/admin/payroll/${b.id}`}
                      className="block space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            <Calendar className="size-3.5 text-muted-foreground" />
                            {formatPeriod(b.period_start, b.period_end)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {b.created_by_name ?? "—"}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatAUD(Number(b.total_amount))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        {statusBadge(b.status)}
                        <span className="text-xs text-muted-foreground">
                          {b.coach_count} coach
                          {b.coach_count !== 1 ? "es" : ""}
                        </span>
                      </div>
                    </Link>
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
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
                    {filtered.map((b) => (
                      <tr key={b.id} className="border-b hover:bg-muted/30">
                        <td className="py-3 pr-4">
                          <Link
                            href={`/admin/payroll/${b.id}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <Calendar className="size-3.5 text-muted-foreground" />
                            {formatPeriod(b.period_start, b.period_end)}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">{statusBadge(b.status)}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {b.coach_count}
                        </td>
                        <td className="py-3 pr-4 text-right font-medium tabular-nums">
                          {formatAUD(Number(b.total_amount))}
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">
                          {b.created_by_name ?? "—"}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            render={<Link href={`/admin/payroll/${b.id}`} />}
                          >
                            View
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
