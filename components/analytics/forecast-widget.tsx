"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

import { getForecastDashboardWidget } from "@/lib/forecasting/actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================
// Helpers
// ============================================================

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

// ============================================================
// Component
// ============================================================

interface WidgetData {
  thisMonth: { revenue: number; profit: number; margin: number } | null;
  nextMonth: { revenue: number; profit: number; margin: number } | null;
  trend: "up" | "down" | "flat";
}

export function ForecastWidget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await getForecastDashboardWidget();
      if (cancelled) return;
      setData(result.data);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.thisMonth) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="size-4" />
            Revenue Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No forecast data available.
          </p>
          <Button
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0"
            render={<Link href="/admin/analytics" />}
          >
            Generate forecast
          </Button>
        </CardContent>
      </Card>
    );
  }

  const TrendIcon =
    data.trend === "up"
      ? TrendingUp
      : data.trend === "down"
        ? TrendingDown
        : Minus;

  const trendColour =
    data.trend === "up"
      ? "text-green-600"
      : data.trend === "down"
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="size-4" />
          Revenue Forecast
        </CardTitle>
        <CardDescription>Monthly projection</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* This month */}
        <div>
          <p className="text-xs text-muted-foreground">This Month</p>
          <p className="text-xl font-semibold">
            {fmtCurrency(data.thisMonth.revenue)}
          </p>
        </div>

        {/* Next month + trend */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Next Month</p>
            <p className="text-base font-medium">
              {data.nextMonth
                ? fmtCurrency(data.nextMonth.revenue)
                : "--"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <TrendIcon className={`size-5 ${trendColour}`} />
          </div>
        </div>

        {/* Margin */}
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-xs text-muted-foreground">Profit Margin</span>
          <span className="text-sm font-medium">
            {data.thisMonth.margin}%
          </span>
        </div>

        {/* Link */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          render={<Link href="/admin/analytics" />}
        >
          View Analytics
        </Button>
      </CardContent>
    </Card>
  );
}
