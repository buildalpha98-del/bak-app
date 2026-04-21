"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Calendar, AlertTriangle } from "lucide-react";
import { getPipelineSnapshot } from "@/lib/crm/metrics-actions";
import type { PipelineSnapshot as SnapshotData } from "@/lib/crm/metrics-actions";

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PipelineSnapshot() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPipelineSnapshot()
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Sales Pipeline</CardTitle>
        <Link
          href="/admin/crm"
          className="text-xs text-primary hover:underline"
        >
          View All →
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 rounded bg-muted" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">Unable to load pipeline data.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-primary" />
                <span className="text-muted-foreground">Active Leads</span>
              </div>
              <span className="text-sm font-semibold">{data.activeLeads}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="size-4 text-orange-500" />
                <span className="text-muted-foreground">Weighted Forecast</span>
              </div>
              <span className="text-sm font-semibold">{formatAUD(data.weightedForecast)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-blue-500" />
                <span className="text-muted-foreground">Demos This Week</span>
              </div>
              <span className="text-sm font-semibold">{data.demosThisWeek}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className={`size-4 ${data.overdueFollowUps > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                <span className="text-muted-foreground">Overdue Follow-ups</span>
              </div>
              <span className={`text-sm font-semibold ${data.overdueFollowUps > 0 ? "text-red-600" : ""}`}>
                {data.overdueFollowUps}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
