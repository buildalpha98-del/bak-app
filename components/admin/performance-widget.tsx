"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PerformanceWidgetData {
  teamAvgScore: number;
  teamAvgTrend: number;
  topPerformers: Array<{ name: string; score: number }>;
  flaggedCoaches: Array<{ name: string; score: number }>;
}

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number) {
  if (score >= 75) return "bg-emerald-50";
  if (score >= 50) return "bg-amber-50";
  return "bg-red-50";
}

export function PerformanceWidget() {
  const [data, setData] = useState<PerformanceWidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { getPerformanceWidgetData } = await import(
          "@/lib/performance/actions"
        );
        const result = await getPerformanceWidgetData();
        setData(result);
      } catch {
        // Widget is non-critical — fail silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Coach Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const TrendIcon = data.teamAvgTrend > 0
    ? TrendingUp
    : data.teamAvgTrend < 0
    ? TrendingDown
    : Minus;

  const trendColor = data.teamAvgTrend > 0
    ? "text-emerald-600"
    : data.teamAvgTrend < 0
    ? "text-red-600"
    : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Coach Performance</CardTitle>
          <Link
            href="/admin/performance"
            className="text-xs text-primary hover:underline"
          >
            View All
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team avg score */}
        <div className="flex items-center gap-3">
          <div
            className={`text-3xl font-bold ${scoreColor(data.teamAvgScore)}`}
          >
            {Math.round(data.teamAvgScore)}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Team Average</p>
            <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon className="size-3" />
              {data.teamAvgTrend > 0 ? "+" : ""}
              {data.teamAvgTrend.toFixed(1)} vs last month
            </div>
          </div>
        </div>

        {/* Top performers */}
        {data.topPerformers.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              Top Performers
            </p>
            <div className="space-y-1">
              {data.topPerformers.map((coach, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">{coach.name}</span>
                  <Badge
                    variant="secondary"
                    className={`${scoreBg(coach.score)} ${scoreColor(coach.score)} border-0`}
                  >
                    {Math.round(coach.score)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flagged coaches */}
        {data.flaggedCoaches.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <AlertTriangle className="size-3 text-red-500" />
              Needs Attention
            </p>
            <div className="space-y-1">
              {data.flaggedCoaches.map((coach, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">{coach.name}</span>
                  <Badge
                    variant="secondary"
                    className="bg-red-50 text-red-600 border-0"
                  >
                    {Math.round(coach.score)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
