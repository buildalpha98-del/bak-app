"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Calculator, CheckCircle2, DollarSign } from "lucide-react";
import { getPayrollSnapshot } from "@/lib/invoicing/payroll-actions";
import type { PayrollSnapshot as SnapshotData } from "@/lib/invoicing/payroll-actions";

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
  return `${s.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}–${e.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
}

export function PayrollSnapshot() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPayrollSnapshot()
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wallet className="size-4" />
          Coach Payroll
        </CardTitle>
        <Link href="/admin/payroll" className="text-xs text-primary hover:underline">
          Manage →
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-5 rounded bg-muted" />)}
          </div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">Unable to load payroll data.</p>
        ) : (
          <div className="space-y-3">
            {data.latestBatch ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Calculator className="size-4 text-primary" />
                  <span className="text-muted-foreground">Latest Period</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {formatPeriod(data.latestBatch.period_start, data.latestBatch.period_end)}
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No batches yet.</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calculator className={`size-4 ${data.awaitingCalculation > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                <span className="text-muted-foreground">Awaiting Calculation</span>
              </div>
              <span className={`text-sm font-semibold ${data.awaitingCalculation > 0 ? "text-amber-600" : ""}`}>
                {data.awaitingCalculation}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className={`size-4 ${data.awaitingPayment > 0 ? "text-blue-500" : "text-muted-foreground"}`} />
                <span className="text-muted-foreground">Awaiting Payment</span>
              </div>
              <span className={`text-sm font-semibold ${data.awaitingPayment > 0 ? "text-blue-600" : ""}`}>
                {data.awaitingPayment}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="size-4 text-green-600" />
                <span className="text-muted-foreground">Paid This Year</span>
              </div>
              <span className="text-sm font-semibold">{formatAUD(data.totalPaidThisYear)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
